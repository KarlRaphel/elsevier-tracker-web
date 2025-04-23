const { app } = require("@azure/functions");

app.http("proxy", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 处理预检请求
    if (request.method === "OPTIONS") {
      return {
        status: 200,
        headers: corsHeaders,
      };
    }

    // 获取 uuid
    const url = new URL(request.url);
    const uuid = url.searchParams.get("uuid");
    if (!uuid) {
      return {
        status: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing uuid parameter" }),
      };
    }

    const apiUrl = `https://tnlkuelk67.execute-api.us-east-1.amazonaws.com/tracker/${uuid}`;

    try {
      const apiRes = await fetch(apiUrl, {
        method: request.method,
      });
      const data = await apiRes.text();

      return {
        status: apiRes.status,
        headers: {
          ...corsHeaders,
          "Content-Type": apiRes.headers.get("content-type") || "text/plain",
        },
        body: data,
      };
    } catch (error) {
      return {
        status: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: error.message || "Server Error" }),
      };
    }
  },
});
