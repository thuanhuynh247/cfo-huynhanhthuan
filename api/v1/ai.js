// Vercel Serverless Function: chuyển tiếp yêu cầu AI tới Anthropic, giữ khoá ở máy chủ.
// Biến môi trường (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY   bắt buộc – khoá Anthropic
//   CFO_ACCESS_CODE     nên đặt – mã người dùng nhập bằng lệnh "ai ma <mã>"; không đặt thì ai cũng gọi được
//   CFO_MODEL           tuỳ chọn – mặc định claude-sonnet-5-5
//   CFO_MAX_TOKENS      tuỳ chọn – trần token mỗi lượt, mặc định 2000

const ALLOWED_MODELS = /^claude-(sonnet|opus|haiku)-[\w.-]+$/;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Chỉ nhận POST" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "Máy chủ chưa cài ANTHROPIC_API_KEY" });
  const code = process.env.CFO_ACCESS_CODE;
  if (code && req.headers["x-cfo-code"] !== code) return res.status(401).json({ error: "Sai mã truy cập" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "JSON không hợp lệ" }); } }
  if (!body || !Array.isArray(body.messages)) return res.status(400).json({ error: "Thiếu messages" });
  if (JSON.stringify(body).length > 400_000) return res.status(413).json({ error: "Yêu cầu quá lớn" });

  const model = ALLOWED_MODELS.test(body.model || "") ? body.model : (process.env.CFO_MODEL || "claude-sonnet-5-5");
  const max = Number(process.env.CFO_MAX_TOKENS || 2000);
  const payload = {
    model,
    max_tokens: Math.min(Number(body.max_tokens) || 1500, max),
    system: typeof body.system === "string" ? body.system.slice(0, 20000) : undefined,
    messages: body.messages,
    tools: Array.isArray(body.tools) ? body.tools.slice(0, 8) : undefined,
  };

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    res.status(r.status).setHeader("content-type", "application/json").send(text);
  } catch (e) {
    res.status(502).json({ error: "Không gọi được Anthropic: " + (e?.message || e) });
  }
}
