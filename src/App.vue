<script setup>
import { ref, reactive } from "vue";

// 首选查询的代理地址，可以自己部署
const apiUrl = "https://elsevier-tracker-web.pages.dev/cors-proxy/?uuid=";
// 如果首选查询代理地址无效，将自动按照以下顺序进行尝试
const apiUrlOptions = [
  "https://elsevier-api-proxy.azurewebsites.net/api/proxy?uuid=",
  "https://elsevier-api-proxy.vercel.app/api/",
  "https://elsevier-api-proxy.599600.xyz/api/",
  "https://tnlkuelk67.execute-api.us-east-1.amazonaws.com/tracker/",
];

// --- State Refs ---
const uuid = ref("");
const paperTitle = ref("");
const submission = ref("");
const journalInfo = ref("");
const firstAuthor = ref("");
const corrAuthor = ref("");
const pubID = ref("");
const lastUpdated = ref("");
const nowState = ref("Review Complete");

const revisionMap = reactive({});
const revisionSummary = reactive({});
const revisionDetail = reactive({});
const revisionList = ref([]);
const latestRevision = ref(null);
const expandedRevision = ref(null);
const isLoading = ref(true);
const errorMsg = ref("");

const noewApi = ref("");

const showDonationCode = ref(false);

// --- Initialization ---
const queryString = window.location.search;
const params = new URLSearchParams(queryString);
uuid.value = params.get("uuid");

// --- Core Logic Functions (groupEvents, sortReviewers, processData, updateState, etc.) ---
// These functions remain the same as the previous version.

function groupEvents(data) {
  Object.keys(revisionMap).forEach((key) => delete revisionMap[key]);
  Object.keys(revisionSummary).forEach((key) => delete revisionSummary[key]);
  Object.keys(revisionDetail).forEach((key) => delete revisionDetail[key]);
  revisionList.value = [];
  errorMsg.value = "";

  latestRevision.value = data.LatestRevisionNumber;

  if (Array.isArray(data.ReviewEvents)) {
    data.ReviewEvents.forEach((evt) => {
      const rev = evt.Revision;
      if (!revisionMap[rev]) revisionMap[rev] = [];
      revisionMap[rev].push(evt);
    });
  }

  const calculatedRevisionList = Object.keys(revisionMap)
    .map((x) => Number(x))
    .sort((a, b) => a - b);
  revisionList.value = calculatedRevisionList;

  calculatedRevisionList.forEach((rev) => {
    const events = revisionMap[rev] || [];
    const reviewerDetailsMap = {};
    let rIdShow = 1;

    events.forEach((event) => {
      const rId = event.Id;
      if (!rId) return;
      if (!reviewerDetailsMap[rId]) {
        reviewerDetailsMap[rId] = {
          displayId: rIdShow++,
          realId: rId,
          invitedDate: null,
          acceptedDate: null,
          completedDate: null,
        };
      }
      const eventDate = toUTC8DateFromUTC3(event.Date);
      if (event.Event === "REVIEWER_INVITED") {
        if (
          !reviewerDetailsMap[rId].invitedDate ||
          eventDate < reviewerDetailsMap[rId].invitedDate
        ) {
          reviewerDetailsMap[rId].invitedDate = eventDate;
        }
      } else if (event.Event === "REVIEWER_ACCEPTED") {
        if (
          !reviewerDetailsMap[rId].acceptedDate ||
          eventDate < reviewerDetailsMap[rId].acceptedDate
        ) {
          reviewerDetailsMap[rId].acceptedDate = eventDate;
        }
      } else if (event.Event === "REVIEWER_COMPLETED") {
        if (
          !reviewerDetailsMap[rId].completedDate ||
          eventDate < reviewerDetailsMap[rId].completedDate
        ) {
          reviewerDetailsMap[rId].completedDate = eventDate;
        }
      }
    });

    let completedCount = 0,
      reviewCount = 0,
      muteCount = 0;
    Object.values(reviewerDetailsMap).forEach((details) => {
      if (details.completedDate) completedCount++;
      else if (details.acceptedDate) reviewCount++;
      else if (details.invitedDate) muteCount++;
    });

    revisionSummary[rev] = {
      complete: completedCount,
      review: reviewCount,
      mute: muteCount,
    };
    revisionDetail[rev] = sortReviewers(reviewerDetailsMap);
  });

  if (
    latestRevision.value !== null &&
    revisionList.value.includes(latestRevision.value)
  ) {
    expandedRevision.value = latestRevision.value;
  } else if (revisionList.value.length > 0) {
    expandedRevision.value = revisionList.value[revisionList.value.length - 1];
  }
  // console.log("Revision Summary:", JSON.parse(JSON.stringify(revisionSummary)));
  // console.log("Revision Detail:", JSON.parse(JSON.stringify(revisionDetail)));
}

function sortReviewers(data) {
  const invitations = Object.values(data);
  return invitations.sort((a, b) => {
    const statusA = a.completedDate ? 3 : a.acceptedDate ? 2 : 1;
    const statusB = b.completedDate ? 3 : b.acceptedDate ? 2 : 1;
    if (statusA !== statusB) return statusB - statusA;
    const dateA = a.completedDate || a.acceptedDate || a.invitedDate;
    const dateB = b.completedDate || b.acceptedDate || b.invitedDate;
    if (!dateA && !dateB) return a.displayId - b.displayId;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return new Date(dateA) - new Date(dateB);
  });
}

function mapStatus(status) {
  switch (status) {
    case 3:
      return "Under Review";
    case 4:
      return "Required Reviews Complete";
    case 23:
      return "Under Review";
  }
}

function processData(data) {
  paperTitle.value = data.ManuscriptTitle || "N/A";
  journalInfo.value =
    data.JournalName || data.JournalAcronym
      ? `${data.JournalName || ""} ${
          data.JournalAcronym ? "(" + data.JournalAcronym + ")" : ""
        }`.trim()
      : "N/A";
  firstAuthor.value = data.FirstAuthor || "N/A";
  corrAuthor.value = data.CorrespondingAuthor || "N/A";
  pubID.value = data.PubdNumber || "N/A";
  lastUpdated.value = data.LastUpdated ? formatStamp(data.LastUpdated) : "N/A";
  submission.value = data.SubmissionDate
    ? formatStamp(data.SubmissionDate)
    : "N/A";
  nowState.value = data.Status ? mapStatus(data.Status) : "Review Complete";
  groupEvents(data);
}

function updateState() {
  isLoading.value = true;
  errorMsg.value = "";
  // 构造所有候选URL
  const urlList = [
    `${apiUrl}${uuid.value}`,
    ...apiUrlOptions.map((url) => `${url}${uuid.value}`),
  ];
  let lastError = null;
  // 设置超时时间
  const TIMEOUT_MS = 3000;
  function tryFetch(index) {
    if (index >= urlList.length) {
      // 全部失败
      errorMsg.value = `无法加载稿件信息: ${
        lastError ? lastError.message : "所有代理都不可用"
      }`;
      paperTitle.value = "错误";
      journalInfo.value = "";
      firstAuthor.value = "";
      corrAuthor.value = "";
      pubID.value = "";
      lastUpdated.value = "";
      revisionList.value = [];
      submission.value = "";
      nowState.value = "";
      isLoading.value = false;
      return;
    }
    const targetUrl = urlList[index];
    noewApi.value = urlList[index].replace(uuid.value, "");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);
    fetch(targetUrl, { signal: controller.signal })
      .then(async (response) => {
        clearTimeout(timeoutId);
        if (!response.ok) {
          let errorData = null;
          try {
            errorData = await response.json();
          } catch (e) {}
          const errorText =
            errorData?.message ||
            response.statusText ||
            `HTTP error ${response.status}`;
          throw new Error(errorText);
        }
        return response.json();
      })
      .then((data) => {
        if (!data || typeof data !== "object")
          throw new Error("收到的数据无效");
        if (data.ReviewEvents === undefined)
          console.warn("API response might be missing 'ReviewEvents'.");
        processData(data);
        isLoading.value = false;
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        lastError = error;
        // 如果是超时或其他错误，尝试下一个代理
        tryFetch(index + 1);
      });
  }
  tryFetch(0);
}

function toUTC8DateFromUTC3(timestampInSeconds) {
  if (!timestampInSeconds) return null;
  try {
    const utcTimestamp = timestampInSeconds * 1000 - 3 * 3600 * 1000;
    const utc8Timestamp = utcTimestamp + 8 * 3600 * 1000;
    return new Date(utc8Timestamp);
  } catch (e) {
    console.error("Error converting timestamp:", timestampInSeconds, e);
    return null;
  }
}

function formatDateTime(dateObj) {
  if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj)) return "N/A";
  try {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const mm = String(dateObj.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${d} ${hh}:${mm}`;
  } catch (e) {
    console.error("Error formatting date:", dateObj, e);
    return "Invalid Date";
  }
}

function formatStamp(timestampInSeconds) {
  const date = toUTC8DateFromUTC3(timestampInSeconds);
  return formatDateTime(date);
}

function calculateDuration(startDate, endDate) {
  if (!startDate || !(startDate instanceof Date) || isNaN(startDate))
    return null;
  const startMillis = startDate.getTime();
  const endMillis =
    endDate && endDate instanceof Date && !isNaN(endDate)
      ? endDate.getTime()
      : Date.now();
  if (endMillis < startMillis) return null;
  const diffMillis = endMillis - startMillis;
  const diffDays = diffMillis / (1000 * 60 * 60 * 24);
  return diffDays.toFixed(1);
}

function toggleRevision(revId) {
  expandedRevision.value = expandedRevision.value === revId ? null : revId;
}

function toggleDonation() {
  showDonationCode.value = !showDonationCode.value;
}

// --- Initial Data Load ---
if (uuid.value) {
  updateState();
} else {
  errorMsg.value = `URL中缺少稿件 'uuid' 参数 <br/>
  正确的URL应该为 ${window.location.origin}/?uuid=您的论文UUID <br/>
  您可以在通讯作者的邮件中查看UUID，例如https://track.authorhub.elsevier.com/?uuid=这里就是您的UUID`;
  isLoading.value = false;
  paperTitle.value = "错误";
}
</script>

<template>
  <div class="container">
    <h1>爱思唯尔稿件状态追踪</h1>

    <div v-if="isLoading" class="loading-indicator card">
      正在尝试通过 {{ noewApi }} 查询稿件信息...
    </div>
    <div v-if="errorMsg" class="error-message card" v-html="errorMsg"></div>

    <div v-if="!isLoading && !errorMsg">
      <div class="manuscript-info card">
        <h2>稿件信息</h2>
        <div><strong>稿件标题：</strong> {{ paperTitle }}</div>
        <div><strong>投稿期刊：</strong> {{ journalInfo }}</div>
        <div><strong>投稿时间：</strong> {{ submission }}</div>
        <div><strong>第一作者：</strong> {{ firstAuthor }}</div>
        <div><strong>通讯作者：</strong> {{ corrAuthor }}</div>
        <div><strong>稿件编号：</strong> {{ pubID }}</div>
        <div><strong>最后更新时间：</strong> {{ lastUpdated }}</div>
        <div><strong>当前稿件状态：</strong> {{ nowState }}</div>
      </div>

      <div class="revisions-section" v-if="revisionList.length > 0">
        <h2>审稿进度</h2>
        <div
          v-for="rev in revisionList"
          :key="rev"
          class="revision-block card"
          :class="{
            latest: rev === latestRevision,
            expanded: expandedRevision === rev,
          }"
        >
          <div class="revision-header" @click="toggleRevision(rev)">
            <span class="revision-title">
              Revision {{ rev }}
              <span v-if="rev === latestRevision" class="latest-badge"
                >(当前)</span
              >
            </span>
            <div class="revision-summary" v-if="revisionSummary[rev]">
              <!-- SVG Icons Removed -->
              <span class="summary-item complete">
                {{ revisionSummary[rev].complete }} 完成
              </span>
              <span class="summary-item review">
                {{ revisionSummary[rev].review }} 审稿中
              </span>
              <span class="summary-item mute">
                {{ revisionSummary[rev].mute }} 已邀请
              </span>
            </div>
            <span class="toggle-icon">{{
              expandedRevision === rev ? "▲" : "▼"
            }}</span>
          </div>

          <div v-if="expandedRevision === rev" class="revision-details">
            <div
              v-if="!revisionDetail[rev] || revisionDetail[rev].length === 0"
              class="no-reviewers"
            >
              此 Revision 尚无审稿人信息。
            </div>
            <div v-else>
              <div
                v-for="reviewer in revisionDetail[rev]"
                :key="reviewer.displayId"
                class="reviewer-row"
              >
                <div class="reviewer-row-header">
                  <span class="reviewer-id"
                    >审稿人 {{ reviewer.displayId }}</span
                  >
                  <span class="reviewer-status">
                    <template v-if="reviewer.completedDate"
                      >[已完成
                      {{ calculateDuration(reviewer.completedDate, null) }}
                      天]</template
                    >
                    <template v-else-if="reviewer.acceptedDate"
                      >[已接受
                      {{ calculateDuration(reviewer.acceptedDate, null) }}
                      天]</template
                    >
                    <template v-else-if="reviewer.invitedDate"
                      >[已邀请
                      {{ calculateDuration(reviewer.invitedDate, null) }}
                      天]</template
                    >
                    <template v-else>[状态未知]</template>
                  </span>
                </div>

                <!-- Timeline Container: Now uses Flexbox for centering -->
                <div class="reviewer-row-timeline-container">
                  <div class="reviewer-timeline">
                    <!-- Invited Step -->
                    <div class="timeline-step invited">
                      <span class="step-label">邀请</span>
                      <span class="step-datetime">{{
                        formatDateTime(reviewer.invitedDate)
                      }}</span>
                    </div>

                    <!-- Spacer & Arrow to Accepted -->
                    <div
                      class="timeline-spacer"
                      :class="{ 'now-spacer': !reviewer.acceptedDate }"
                    >
                      <span v-if="reviewer.acceptedDate"
                        >--
                        {{
                          calculateDuration(
                            reviewer.invitedDate,
                            reviewer.acceptedDate
                          )
                        }}
                        天 --></span
                      >
                      <span v-else>-- 进行中 --></span>
                    </div>

                    <!-- Accepted Step -->
                    <div
                      class="timeline-step"
                      :class="
                        reviewer.acceptedDate ? 'accepted' : 'placeholder'
                      "
                    >
                      <span class="step-label">接受</span>
                      <span
                        v-if="reviewer.acceptedDate"
                        class="step-datetime"
                        >{{ formatDateTime(reviewer.acceptedDate) }}</span
                      >
                    </div>

                    <!-- Spacer & Arrow to Completed -->
                    <template
                      v-if="reviewer.acceptedDate || reviewer.completedDate"
                    >
                      <div
                        class="timeline-spacer"
                        :class="{
                          'now-spacer':
                            reviewer.acceptedDate && !reviewer.completedDate,
                          'placeholder-spacer': !reviewer.acceptedDate,
                        }"
                      >
                        <span v-if="reviewer.completedDate"
                          >--
                          {{
                            calculateDuration(
                              reviewer.acceptedDate,
                              reviewer.completedDate
                            )
                          }}
                          天 --></span
                        >
                        <span v-else-if="reviewer.acceptedDate"
                          >-- 进行中 --></span
                        >
                        <span v-else>------></span>
                      </div>
                      <div
                        class="timeline-step"
                        :class="
                          reviewer.completedDate ? 'completed' : 'placeholder'
                        "
                      >
                        <span class="step-label">完成</span>
                        <span
                          v-if="reviewer.completedDate"
                          class="step-datetime"
                          >{{ formatDateTime(reviewer.completedDate) }}</span
                        >
                      </div>
                    </template>
                    <template v-else>
                      <div class="timeline-spacer placeholder-spacer">
                        ------>
                      </div>
                      <div class="timeline-step placeholder">
                        <span class="step-label">完成</span>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="!isLoading && !errorMsg" class="revisions-section card">
        <p>暂无审稿事件信息。</p>
      </div>
    </div>

    <div class="footer">
      <div class="footer-text">
        <a href="https://github.com/KarlRaphel/elsevier-tracker-web"
          >View Source on GitHub
        </a>
        <span style="width: 20px">|</span>
        <img
          src="https://img.shields.io/github/stars/KarlRaphel/elsevier-tracker-web"
        />
      </div>
      <div class="footer-text" @click="toggleDonation">
        觉得好用？欢迎Star⭐️ / 分享📢 / 捐赠1元💰
      </div>
      <div class="footer-text" v-show="showDonationCode">
        <img
          src="/donation_qr_code.jpg"
          alt="捐赠二维码"
          style="width: 250px"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- Base & Card Styles --- */
.container {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  max-width: 950px;
  margin: 20px auto;
  padding: 15px;
  color: #333;
}
.card {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.07);
}
.loading-indicator,
.error-message {
  text-align: center;
  padding: 30px 20px;
  font-size: 1.1em;
  color: #555;
}
.error-message {
  color: #e74c3c;
  font-weight: bold;
}
h1 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 30px;
}
h2 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #34495e;
  border-bottom: 1px solid #ecf0f1;
  padding-bottom: 8px;
  font-weight: 600;
}
.manuscript-info div {
  margin-bottom: 8px;
  line-height: 1.6;
}
.manuscript-info strong {
  color: #555;
  min-width: 110px;
  display: inline-block;
  font-weight: 600;
}
.revisions-section {
  margin-top: 30px;
}
.revision-block {
  border-left: 5px solid #bdc3c7;
  transition: border-color 0.3s ease;
  padding: 0;
}
.revision-block.latest {
  border-left-color: #e67e22;
}
.revision-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  cursor: pointer;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  flex-wrap: wrap;
  gap: 10px;
}
.revision-block.expanded .revision-header {
  border-bottom-color: transparent;
}
.revision-title {
  font-weight: bold;
  font-size: 1.1em;
  color: #2c3e50;
}
.latest-badge {
  font-size: 0.8em;
  font-weight: normal;
  color: #e67e22;
  margin-left: 8px;
  background-color: #fdf3e7;
  padding: 2px 5px;
  border-radius: 3px;
}
.revision-summary {
  display: flex;
  gap: 10px; /* Reduced gap */
  font-size: 0.9em;
  flex-wrap: wrap;
}
.summary-item {
  display: inline-flex; /* Use inline-flex */
  align-items: center;
  gap: 4px;
  padding: 4px 10px; /* Adjusted padding */
  border-radius: 12px;
  color: #fff;
  font-weight: 500;
}
/* SVG removed, no need for svg styles */
.summary-item.complete {
  background-color: #27ae60;
}
.summary-item.review {
  background-color: #f39c12;
}
.summary-item.mute {
  background-color: #8e9eab;
}
.toggle-icon {
  font-size: 0.8em;
  color: #7f8c8d;
  margin-left: auto;
  padding-left: 10px;
}
.revision-details {
  padding: 0px 0px 10px 0px;
  border-top: 1px solid #e0e0e0;
  background-color: #fff;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}
.no-reviewers {
  color: #7f8c8d;
  font-style: italic;
  text-align: center;
  padding: 25px 20px;
}

/* --- Reviewer Row Structure --- */
.reviewer-row {
  padding: 15px 20px;
  border-bottom: 1px solid #ecf0f1;
}
.reviewer-row:last-child {
  border-bottom: none;
  padding-bottom: 10px;
}
.reviewer-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 10px;
}
.reviewer-id {
  font-weight: 600;
  color: #34495e;
}
.reviewer-status {
  font-size: 0.9em;
  color: #525f7f;
  font-style: italic;
  white-space: nowrap;
  flex-shrink: 0;
}

/* --- Timeline Container: Centering + Scrolling --- */
.reviewer-row-timeline-container {
  display: flex; /* Use flexbox */
  justify-content: center; /* Center timeline horizontally if space allows */
  overflow-x: auto; /* Allow horizontal scrolling if needed */
  overflow-y: hidden;
  padding: 5px 0px;
  margin: 0 -5px;

  /* Scrollbar styling (optional) */
  &::-webkit-scrollbar {
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
}

.reviewer-timeline {
  display: inline-flex; /* Keep using inline-flex for width calculation */
  align-items: center;
  white-space: nowrap;
  padding: 0 5px;
  gap: 0;
}

/* --- Timeline Step Box (User Specified Dimensions) --- */
.timeline-step {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 12px; /* Keep padding */
  border-radius: 6px;
  border: 1px solid;
  text-align: center;
  min-width: 140px; /* USER SPECIFIED */
  min-height: 55px; /* USER SPECIFIED */
  box-sizing: border-box;
  background-color: #fff;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  flex-shrink: 0;
}
.step-label {
  font-size: 0.8em;
  font-weight: bold;
  margin-bottom: 4px;
  color: inherit;
}
.step-datetime {
  font-size: 0.85em;
  line-height: 1.3;
  color: #555;
  white-space: nowrap;
}

/* Step Specific Styles */
.timeline-step.invited {
  border-color: #aab7c4;
  background-color: #f8f9fa;
  color: #525f7f;
}
.timeline-step.accepted {
  border-color: #f39c12;
  background-color: #fff8e1;
  color: #c06c0a;
}
.timeline-step.completed {
  border-color: #27ae60;
  background-color: #e6f7ee;
  color: #1e8449;
}
.timeline-step.placeholder {
  border-color: #d1d9e6;
  background-color: #f8f9fa;
  color: #aab7c4;
  border-style: dashed;
}
.timeline-step.placeholder .step-datetime {
  display: none;
}

/* --- Timeline Spacer --- */
.timeline-spacer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  text-align: center;
  font-size: 0.85em;
  color: #8898aa;
  padding: 0 5px;
  flex-shrink: 0;
  white-space: nowrap;
  font-family: monospace;
}
.timeline-spacer.now-spacer {
  color: #e46f0a;
  font-weight: bold;
}
.timeline-spacer.placeholder-spacer {
  color: #cad1db;
}

/* --- Responsive adjustments --- */
@media (max-width: 768px) {
  .card {
    padding: 15px;
  }
  .reviewer-row {
    padding: 12px 15px;
  }
  .reviewer-row-header {
    margin-bottom: 10px;
  }
  /* Centering logic handles layout, less specific overrides needed */
  .reviewer-row-timeline-container {
    justify-content: flex-start; /* On small screens, align left before scrolling */
  }
}

@media (max-width: 480px) {
  .manuscript-info strong {
    min-width: 90px;
  }
  .reviewer-row {
    padding: 10px;
  }
  .reviewer-row-header {
    gap: 5px;
  }
  .reviewer-id {
    font-size: 0.95em;
  }
  .reviewer-status {
    font-size: 0.85em;
  }
  /* Step/spacer sizes can remain or be adjusted if needed */
}

.footer {
  padding: 5px;
  display: flex;
  background-color: #f8f9fa;
  flex-direction: column;
}

.footer-text {
  padding: 2px;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}
</style>
