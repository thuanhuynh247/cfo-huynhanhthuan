// index.mjs — Máy chủ cục bộ của CFO Terminal (chỉ nghe 127.0.0.1).
// Phục vụ giao diện, số liệu trong %APPDATA%\CFO Terminal\data, API /api/v1 cho Excel/Power BI,
// kết nối AI (Claude Code, Codex, Gemini, Ollama, khoá API…) và lệnh cập nhật số liệu.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEngines, startLogin, startInstall, getJob, sendJobInput, stopJob, pingEngine, runAi } from "./drivers.mjs";
import { getConfig, getPublicConfig, updateConfig } from "./store.mjs";
import { USER_DATA, SEED_DIR, seedUserData, updateAll, isRunning, state as crawlState } from "./crawler.mjs";
import { FILES, buildTables, computeMetrics } from "../lib/core.js";
import { apiV1 } from "../lib/api-v1.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
export const DEFAULT_PORT = 47240;

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8", ".yaml": "text/yaml; charset=utf-8" };
// Chỉ phục vụ các thư mục giao diện; không bao giờ lộ server/, config hay khoá
const STATIC = [["/assets/", path.join(ROOT, "assets")], ["/lib/", path.join(ROOT, "lib")], ["/vendor/", path.join(ROOT, "assets", "vendor")]];

function send(res, code, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const ok = (res, data) => send(res, 200, data);
const fail = (res, e, code = 400) => send(res, code, { error: e?.message || String(e) });

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("Dữ liệu quá lớn.")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

// ---------- số liệu cho API (đọc lại khi tệp đổi) ----------
const dataFile = (rel) => { const u = path.join(USER_DATA, rel); return fs.existsSync(u) ? u : path.join(SEED_DIR, rel); };
let cache = { key: "", ctx: null };
function context() {
  const files = Object.values(FILES).map(dataFile);
  const key = files.map((f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }).join("|");
  if (cache.key === key && cache.ctx) return cache.ctx;
  const raw = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => { try { return [k, JSON.parse(fs.readFileSync(dataFile(rel), "utf8"))]; } catch { return [k, null]; } }));
  const ont = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "ontology.json"), "utf8"));
  const t = buildTables(raw);
  cache = { key, ctx: { raw, ont, t, M: computeMetrics(t) } };
  return cache.ctx;
}

async function route(req, res, url, base) {
  const p = url.pathname;
  let mm;

  if (p === "/api/health") return ok(res, { ok: true, version: VERSION, app: "CFO Terminal" });

  // ----- API cho Excel / Power BI (mở CORS cho GET vì chỉ nghe trên máy này) -----
  if (p === "/api/v1" || p.startsWith("/api/v1/")) {
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, new Error("Chỉ nhận GET"), 405);
    const r = apiV1(p, Object.fromEntries(url.searchParams), { ...context(), origin: base });
    const extra = { "Access-Control-Allow-Origin": "*" };
    if (r.filename) extra["Content-Disposition"] = `inline; filename="${r.filename}"`;
    return send(res, r.status, typeof r.body === "string" ? r.body : JSON.stringify(r.body, null, 1), r.type, extra);
  }

  // ----- số liệu thô cho giao diện -----
  if ((mm = /^\/data\/((?:nhnn|ngan-hang)\/[\w-]+\.json)$/.exec(p))) {
    const f = dataFile(mm[1]);
    if (!fs.existsSync(f)) return send(res, 404, "null");
    return send(res, 200, fs.readFileSync(f), "application/json; charset=utf-8");
  }

  // ----- cập nhật số liệu -----
  if (p === "/api/capnhat") {
    if (req.method === "POST") {
      const b = await readBody(req);
      updateAll({ force: Boolean(b.force) }).catch(() => {});
    }
    return ok(res, { running: isRunning(), lastRun: crawlState.lastRun, lastError: crawlState.lastError, result: crawlState.lastResult, log: crawlState.log.slice(-30) });
  }

  // ----- AI -----
  if (p === "/api/engines") return ok(res, await listEngines());
  if (p === "/api/engines/login" && req.method === "POST") { const b = await readBody(req); return ok(res, startLogin(b.id, { mode: b.mode })); }
  if (p === "/api/engines/install" && req.method === "POST") { const b = await readBody(req); return ok(res, startInstall(b.id, { mode: b.mode })); }
  if (p === "/api/engines/ping" && req.method === "POST") { const b = await readBody(req); return ok(res, await pingEngine(b.id, b.model)); }
  if ((mm = /^\/api\/jobs\/([\w-]+)$/.exec(p))) return ok(res, getJob(mm[1]) || { status: "missing" });
  if ((mm = /^\/api\/jobs\/([\w-]+)\/input$/.exec(p)) && req.method === "POST") { const b = await readBody(req); return ok(res, sendJobInput(mm[1], b.text)); }
  if ((mm = /^\/api\/jobs\/([\w-]+)\/stop$/.exec(p)) && req.method === "POST") return ok(res, stopJob(mm[1]));
  if (p === "/api/config") {
    if (req.method === "POST") return ok(res, updateConfig(await readBody(req)));
    return ok(res, getPublicConfig());
  }
  // Một lượt suy luận: giao diện gửi toàn bộ lời nhắc (đã gồm công cụ và lịch sử), máy chủ gọi nền tảng AI đã chọn
  if (p === "/api/ai/run" && req.method === "POST") {
    const b = await readBody(req);
    const cfg = getConfig();
    if (!String(b.prompt || "").trim()) throw new Error("Thiếu lời nhắc.");
    const r = await runAi(String(b.prompt), { engine: cfg.engine, model: cfg.model, fallback: cfg.fallback || [] });
    return ok(res, r);
  }

  // ----- giao diện -----
  if (req.method === "GET" && !p.startsWith("/api/")) {
    let f;
    if (p === "/" || p === "/index.html") f = path.join(ROOT, "index.html");
    else for (const [prefix, dir] of STATIC) if (p.startsWith(prefix)) { const c = path.resolve(dir, decodeURIComponent(p.slice(prefix.length))); if (c.startsWith(dir + path.sep)) f = c; break; }
    if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, "Không có", "text/plain; charset=utf-8");
    return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || "application/octet-stream");
  }
  return fail(res, new Error("Không có API này."), 404);
}

export function startServer({ port = +(process.env.PORT || DEFAULT_PORT), host = "127.0.0.1", autoUpdate = true } = {}) {
  try { seedUserData(); } catch (e) { console.error("seed:", e.message); }
  let base = "";
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${host}`);
    // Chặn trang web lạ gọi vào máy chủ cục bộ (Excel, Power BI không gửi Origin nên vẫn đọc được)
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) return fail(res, new Error("Origin không được phép."), 403);
    try { await route(req, res, url, base); } catch (e) { fail(res, e, 500); }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      base = `http://${host}:${server.address().port}`;
      console.log(`CFO_LISTENING=${base}`);
      if (autoUpdate && getConfig().autoUpdate !== false && !process.env.CFO_NO_UPDATE) {
        const tick = () => updateAll().catch((e) => console.error("cập nhật:", e.message));
        setTimeout(tick, 3000).unref();
        setInterval(tick, 60 * 60 * 1000).unref();
      }
      resolve({ server, url: base });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((e) => {
    if (e.code === "EADDRINUSE") startServer({ port: 0 });
    else { console.error(e); process.exit(1); }
  });
}
