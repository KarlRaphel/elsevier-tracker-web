export default async function handler(req, res) {
  // 设置CORS响应头
  res.setHeader('Access-Control-Allow-Origin', '*'); // 或指定前端域名
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { uuid } = req.query;
  const apiUrl = `https://tnlkuelk67.execute-api.us-east-1.amazonaws.com/tracker/${uuid}`;

  try {
    const apiRes = await fetch(apiUrl, {
      method: req.method,
    });

    const data = await apiRes.text();
    res.status(apiRes.status).send(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server Error' });
  }
}

