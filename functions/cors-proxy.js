export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const uuid = url.searchParams.get("uuid");
  const apiUrl = `https://tnlkuelk67.execute-api.us-east-1.amazonaws.com/tracker/${uuid}`;

  // 设置CORS 头的函数
  function withCORSHeaders(resp) {
    resp.headers.set("Access-Control-Allow-Origin", "*");
    resp.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    resp.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return resp;
  }

  // 处理预检请求
  if (request.method === "OPTIONS") {
    const resp = new Response(null, { status: 200 });
    return withCORSHeaders(resp);
  }

  if (!uuid) {
    return withCORSHeaders(
      new Response(JSON.stringify({ error: "Missing uuid parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  try {
    const apiRes = await fetch(apiUrl, {
      method: request.method,
    });
    const data = await apiRes.text();
    const resp = new Response(data, {
      status: apiRes.status,
      headers: {
        "Content-Type": apiRes.headers.get("Content-Type") || "text/plain",
      },
    });
    return withCORSHeaders(resp);
  } catch (error) {
    const resp = new Response(
      JSON.stringify({ error: error.message || "Server Error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
    return withCORSHeaders(resp);
  }
}
