// CFO Terminal – giao diện dòng lệnh có AI cho phân tích tiền tệ.
// Số liệu: app tự cào NHNN và giá ngân hàng ngay trên máy (server/crawler.mjs), lưu ở %APPDATA%\\CFO Terminal\\data.
// Tính toán: lib/core.js (dùng chung với API /api/v1/*).
// Ngữ nghĩa: assets/ontology.json, sinh từ ontology/build_ontology.py theo chuẩn NVIDIA Auto Ontology.
import { N, S, DMY, MY, T, todayVN, days, fold, median, FILES, buildTables, computeMetrics as coreMetrics, signals as coreSignals } from "/lib/core.js";

const QS = new URLSearchParams(location.search);
const CFG = {
  dataBase: QS.get("data") || "/data/",
  duckdb: "/vendor/duckdb/",
  duckdbCdn: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev57.0/+esm",
  maxSteps: 8,
};
const DESKTOP = window.DESKTOP || null; // cầu nối Electron (lưu tệp qua hộp thoại Windows)
async function api(path, body) {
  const r = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// ================================================================ tiện ích
const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const store = {
  get(k, d) { try { const v = localStorage.getItem("cfo:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { v == null ? localStorage.removeItem("cfo:" + k) : localStorage.setItem("cfo:" + k, JSON.stringify(v)); } catch {} },
};
async function getJSON(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
async function download(name, text, type = "text/plain") {
  if (DESKTOP?.saveText) { const r = await DESKTOP.saveText(name, text); return r?.path || null; } const a = el("a", { href: URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
async function copy(text, btn) { try { await navigator.clipboard.writeText(text); if (btn) { const o = btn.textContent; btn.textContent = "Đã chép"; setTimeout(() => (btn.textContent = o), 1400); } } catch { /* trình duyệt chặn */ } }

// ================================================================ số liệu
const D = { raw: null, t: {}, ont: null, ready: false, err: null, loadedAt: null };

async function loadAll() {
  const base = CFG.dataBase, v = Math.floor(Date.now() / 300000);
  const [ont, ...vals] = await Promise.all([getJSON("/assets/ontology.json"),
    ...Object.values(FILES).map((f) => getJSON(base + f + "?t=" + v).catch((e) => { console.warn(e); return null; }))]);
  D.ont = ont;
  D.raw = Object.fromEntries(Object.keys(FILES).map((k, i) => [k, vals[i]]));
  D.t = buildTables(D.raw); // dựng các bảng đúng như ontology mô tả
  D.ready = true;
  D.loadedAt = new Date();
  duck = null; // bảng SQL phải nạp lại theo số mới
  computeMetrics();
}

// ================================================================ chỉ số (cùng định nghĩa với ontology)
let M = {};
function computeMetrics() { M = coreMetrics(D.t); }
const signals = () => coreSignals(M, D.raw, todayVN());

// ================================================================ vẽ biểu đồ (SVG tự vẽ, không thư viện)
const redraws = new Set();
function chartBox(draw, label) {
  const box = el("div", { class: "chart", role: "img", "aria-label": label });
  const run = () => { if (!box.isConnected) { redraws.delete(run); return; } draw(box); };
  redraws.add(run);
  requestAnimationFrame(run);
  return box;
}
addEventListener("resize", () => { clearTimeout(window.__rz); window.__rz = setTimeout(() => redraws.forEach((f) => f()), 150); });
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }

function lineChart(o) {
  return chartBox((box) => {
    box.replaceChildren();
    if (o.legend !== false && o.series.length > 1) box.append(el("div", { class: "legend" }, o.series.map((s) => el("span", {}, el("i", { style: `background:${css(s.color)}` }), s.name)), (o.refs || []).map((r) => el("span", {}, el("i", { style: `background:transparent;border-top:2px dashed ${css("--c5")}` }), r.label))));
    const W = Math.max(280, box.clientWidth - 24), H = o.height || 200, m = { t: 10, r: 10, b: 22, l: o.left || 48 };
    const ser = o.series.filter((s) => s.pts.length);
    const all = ser.flatMap((s) => s.pts);
    if (!all.length) { box.append(el("div", { class: "muted" }, "Chưa có số liệu.")); return; }
    let x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0])); if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
    const ys = all.map((p) => p[1]).concat((o.refs || []).map((r) => r.y));
    let y0 = o.y0 ?? Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0) * 0.08 || 1; if (o.y0 == null) y0 -= pad; y1 += pad;
    const X = (v) => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = (v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);
    const add = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); return e; };
    const st = niceStep((y1 - y0) / 4);
    for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) { add("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: css("--line") }); add("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end" }).textContent = o.fmt(v); }
    const span = (x1 - x0) / 864e5, nT = Math.max(2, Math.floor((W - m.l - m.r) / 90));
    for (let i = 0; i <= nT; i++) { const v = x0 + (x1 - x0) * i / nT, d = new Date(v).toISOString(); add("text", { x: X(v), y: H - 5, "text-anchor": i === 0 ? "start" : i === nT ? "end" : "middle" }).textContent = span > 200 ? MY(d) : DMY(d).slice(0, 5); }
    const refs = []; for (const r of o.refs || []) { const same = refs.find((x) => Math.abs(x.y - r.y) < (y1 - y0) * 0.03); if (same) same.label += " = " + r.label; else refs.push({ ...r }); }
    refs.forEach((r) => { if (r.y < y0 || r.y > y1) return; add("line", { x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), stroke: css("--c5"), "stroke-dasharray": "5 4" }); add("text", { x: W - m.r, y: Y(r.y) - 4, "text-anchor": "end" }).textContent = r.label; });
    ser.forEach((s) => {
      const gap = (o.gapDays || 12) * 864e5; let d = "";
      s.pts.forEach((p, i) => { d += (i && p[0] - s.pts[i - 1][0] <= gap ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); });
      add("path", { d, fill: "none", stroke: css(s.color), "stroke-width": s.w || 2, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" });
      if (s.pts.length < 30) s.pts.forEach((p) => add("circle", { cx: X(p[0]), cy: Y(p[1]), r: 2.6, fill: css(s.color) }));
    });
    const guide = add("line", { y1: m.t, y2: H - m.b, stroke: css("--muted"), opacity: 0 });
    const tip = el("div", { class: "tip" });
    box.append(svg, tip);
    const xs = [...new Set(all.map((p) => p[0]))].sort((a, b) => a - b);
    svg.addEventListener("pointermove", (ev) => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, tv = x0 + (px - m.l) / (W - m.l - m.r) * (x1 - x0);
      let best = xs[0]; for (const v of xs) if (Math.abs(v - tv) < Math.abs(best - tv)) best = v;
      guide.setAttribute("x1", X(best)); guide.setAttribute("x2", X(best)); guide.setAttribute("opacity", .5);
      tip.replaceChildren(el("div", { class: "k" }, DMY(new Date(best).toISOString())), ...ser.map((s) => { const p = s.pts.find((q) => q[0] === best); return p ? el("div", {}, el("span", { style: `color:${css(s.color)}` }, "● "), `${s.name}: `, el("b", {}, o.fmt(p[1]) + (o.unit || ""))) : null; }));
      tip.style.display = "block"; const tw = tip.offsetWidth; let lx = X(best) * r.width / W + 18; if (lx + tw > box.clientWidth) lx -= tw + 24; tip.style.left = Math.max(4, lx) + "px"; tip.style.top = "8px";
    });
    svg.addEventListener("pointerleave", () => { tip.style.display = "none"; guide.setAttribute("opacity", 0); });
  }, o.label);
}
function barChart(o) {
  return chartBox((box) => {
    box.replaceChildren();
    const W = Math.max(280, box.clientWidth - 24), H = o.height || 170, m = { t: 8, r: 8, b: 22, l: o.left || 44 };
    const v = o.vals, max = Math.max(...v.map((x) => x.v || 0)) * 1.08 || 1, bw = (W - m.l - m.r) / v.length;
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);
    const add = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); return e; };
    const Y = (x) => H - m.b - x / max * (H - m.t - m.b), st = niceStep(max / 4);
    for (let y = 0; y <= max; y += st) { add("line", { x1: m.l, x2: W - m.r, y1: Y(y), y2: Y(y), stroke: css("--line") }); add("text", { x: m.l - 6, y: Y(y) + 4, "text-anchor": "end" }).textContent = o.fmt(y); }
    v.forEach((x, i) => { if (!x.v) return; add("rect", { x: m.l + i * bw + bw * .15, width: Math.max(1, bw * .7), y: Y(x.v), height: Y(0) - Y(x.v), rx: 1.5, fill: css(x.color || "--c1") }); });
    const every = Math.ceil(v.length / Math.max(2, Math.floor((W - m.l) / 70)));
    v.forEach((x, i) => { if (i % every === 0) add("text", { x: m.l + i * bw + bw / 2, y: H - 5, "text-anchor": "middle" }).textContent = x.label; });
    const tip = el("div", { class: "tip" });
    box.append(svg, tip);
    svg.addEventListener("pointermove", (ev) => { const r = svg.getBoundingClientRect(); const i = Math.max(0, Math.min(v.length - 1, Math.floor(((ev.clientX - r.left) * W / r.width - m.l) / bw))); tip.replaceChildren(el("div", { class: "k" }, v[i].title || v[i].label), el("div", {}, o.fmt(v[i].v) + (o.unit || ""))); tip.style.display = "block"; let lx = (m.l + i * bw) * r.width / W + 14; if (lx + tip.offsetWidth > box.clientWidth) lx -= tip.offsetWidth + 20; tip.style.left = Math.max(4, lx) + "px"; tip.style.top = "8px"; });
    svg.addEventListener("pointerleave", () => (tip.style.display = "none"));
  }, o.label);
}
function gauge(pct) {
  const v = Math.max(0, Math.min(100, pct ?? 0)), col = v >= 80 ? "--bad" : v >= 50 ? "--warn" : "--c1";
  return el("div", {}, el("div", { class: "gauge", role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(v), "aria-label": "Vị trí trong biên độ trên" }, el("span", { style: `width:${v}%;background:${css(col)}` })), el("div", { class: "scale" }, el("span", {}, "Trung tâm 0%"), el("span", {}, "50%"), el("span", {}, "Trần 100%")));
}
const kpi = (l, v, unit, s, cls) => el("div", { class: "kpi" }, el("div", { class: "l" }, l), el("div", { class: "v " + (cls || "") }, v, unit ? el("small", {}, unit) : null), s ? el("div", { class: "s" }, s) : null);
function table(cols, rows, opts = {}) {
  return el("div", { class: "tw", style: opts.maxH ? `max-height:${opts.maxH}px` : null },
    el("table", {}, el("thead", {}, el("tr", {}, cols.map((c) => el("th", { class: c.n ? "n" : null }, c.l)))),
      el("tbody", {}, rows.map((r) => el("tr", {}, cols.map((c) => { const v = typeof c.f === "function" ? c.f(r) : r[c.k]; return el("td", { class: [c.n ? "n" : "", c.wrap ? "wrap" : "", c.cls ? c.cls(r) : ""].join(" ").trim() || null }, v instanceof Node ? v : (v ?? "—")); }))))));
}
const P = (...k) => el("p", {}, ...k);
const H = (t) => el("p", { class: "h" }, t);
const link = (cmd, text) => el("a", { href: "#lenh=" + encodeURIComponent(cmd), onclick: (e) => { e.preventDefault(); exec(cmd); } }, text || cmd);
const next = (...cmds) => el("p", { class: "muted" }, "Tiếp: ", cmds.flatMap((c, i) => [i ? " · " : "", link(c)]));
const range = (arg, def = 92) => { const a = fold(arg || ""); if (!a) return def; if (a === "ytd" || a === "nam") return "ytd"; if (a === "all" || a === "tatca") return 0; const m = a.match(/^(\d+)\s*(y|n|nam|t|th|thang|d|ngay)?$/); if (!m) return def; const n = +m[1], u = m[2] || "d"; return u.startsWith("y") || u.startsWith("n") && u !== "ngay" ? n * 365 : u.startsWith("t") ? n * 31 : n; };
const cut = (r, lastIso) => r === 0 ? -Infinity : r === "ytd" ? T(lastIso.slice(0, 4) + "-01-01") : T(lastIso) - r * 864e5;
const rangeLabel = (r) => r === 0 ? "toàn bộ lịch sử" : r === "ytd" ? "từ đầu năm" : `${r} ngày gần nhất`;
const need = () => { if (!D.ready) throw new Error("Số liệu chưa nạp xong, thử lại sau vài giây."); };

// ================================================================ SQL trong trình duyệt (DuckDB-WASM, nạp khi cần)
let duck = null;
async function getDuck(onStatus) {
  if (duck) return duck;
  need();
  onStatus?.("Đang khởi động bộ máy SQL (DuckDB)…");
  let db;
  try {
    const m = await import(CFG.duckdb + "duckdb.mjs");
    const base = new URL(CFG.duckdb, location.href).href;
    db = new m.AsyncDuckDB(new m.VoidLogger(), new Worker(base + "duckdb-browser-eh.worker.js"));
    await db.instantiate(base + "duckdb-eh.wasm");
  } catch (e) { // bản web không có DuckDB đóng gói sẵn: nạp từ CDN
    console.warn("DuckDB cục bộ lỗi, dùng CDN:", e);
    const m = await import(CFG.duckdbCdn);
    const bundle = await m.selectBundle(m.getJsDelivrBundles());
    const wurl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
    db = new m.AsyncDuckDB(new m.VoidLogger(), new Worker(wurl));
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(wurl);
  }
  const conn = await db.connect();
  // Tạo bảng đúng kiểu dữ liệu trong ontology rồi chèn bằng INSERT (không cần tải phần mở rộng JSON từ mạng)
  const lit = (v, type) => {
    if (v == null || (typeof v === "number" && !isFinite(v))) return "NULL";
    if (type === "DOUBLE" || type === "INTEGER") return String(Number(v));
    return "'" + String(v).replace(/'/g, "''") + "'";
  };
  for (const ds of D.ont.datasets) {
    await conn.query(`CREATE OR REPLACE TABLE ${ds.name} (${ds.fields.map((f) => `${f.name} ${f.type}`).join(", ")})`);
    const rows = D.t[ds.name] || [];
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000).map((r) => "(" + ds.fields.map((f) => lit(r[f.name], f.type)).join(", ") + ")").join(",\n");
      await conn.query(`INSERT INTO ${ds.name} VALUES ${chunk}`);
    }
  }
  duck = { db, conn };
  return duck;
}
function checkSQL(sql, allowed) {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (/;/.test(s)) throw new Error("Chỉ chạy một câu lệnh mỗi lần.");
  if (!/^(select|with|describe|summarize|show|from)\b/i.test(s)) throw new Error("Chỉ cho phép câu lệnh đọc (SELECT, WITH, DESCRIBE, SUMMARIZE).");
  if (/\b(read_csv|read_json|read_parquet|httpfs|copy|attach|install|load|pragma)\b/i.test(s)) throw new Error("Không được đọc tệp hay tải phần mở rộng.");
  const known = D.ont.datasets.map((d) => d.name);
  const used = known.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(s));
  if (allowed) { const bad = used.filter((n) => !allowed.has(n)); if (bad.length) throw new Error(`Bảng ${bad.join(", ")} chưa được retrieve. Hãy retrieve khái niệm liên quan trước.`); }
  return { sql: s, used };
}
async function runSQL(sql, { limit = 200, allowed, onStatus } = {}) {
  const { sql: s, used } = checkSQL(sql, allowed);
  const { conn } = await getDuck(onStatus);
  const res = await conn.query(s);
  const fields = res.schema.fields;
  const conv = (v, f) => { if (v == null) return null; if (typeof v === "bigint") return Number(v); if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === "number" && /Date|Timestamp/.test(String(f.type))) return new Date(v).toISOString().slice(0, 10); if (typeof v === "object" && v.toString) return String(v); return v; };
  const all = res.toArray();
  const rows = all.slice(0, limit).map((r) => Object.fromEntries(fields.map((f) => [f.name, conv(r[f.name], f)])));
  return { columns: fields.map((f) => f.name), rows, row_count: all.length, truncated: all.length > limit, used };
}
const fmtCell = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? DMY(v) : typeof v === "number" ? (Number.isInteger(v) && Math.abs(v) < 1e15 ? N(v) : N(v, Math.abs(v) < 100 ? 2 : 0)) : v;
const sqlTable = (r) => table(r.columns.map((c) => ({ l: c, k: c, n: r.rows.some((x) => typeof x[c] === "number"), f: (x) => fmtCell(x[c]) })), r.rows, { maxH: 360 });

// ================================================================ ontology: tìm khái niệm, kiểm tra câu hỏi
const STOP = new Set("gia cua va la nhu the nao bao nhieu so voi tuan nay thang nam ngay hom co khong cho toi xem hien tai bay gio gan day muc".split(" "));
function searchTerms(q, k = 6) {
  const qq = fold(q), words = qq.split(/[^a-z0-9%]+/).filter((w) => w.length > 1 && !STOP.has(w));
  const scored = D.ont.terms.map((t) => {
    const names = [t.ten, ...t.dong_nghia, t.id.replace(/_/g, " ")].map(fold);
    let sc = 0;
    for (const n of names) {
      if (n.length > 2 && qq.includes(n)) { sc = Math.max(sc, 3 + n.length / 10); continue; }
      const nw = n.split(/\s+/).filter((w) => !STOP.has(w));
      if (!nw.length) continue;
      const hit = nw.filter((w) => words.includes(w)).length;
      sc = Math.max(sc, hit / nw.length);
    }
    return { t, sc };
  }).filter((x) => x.sc >= .5).sort((a, b) => b.sc - a.sc);
  return scored.slice(0, k).map((x) => x.t);
}
function gapsIn(q) { const qq = fold(q); return D.ont.gaps.filter((g) => qq.includes(fold(g))); }
function termDetail(t) {
  const ds = D.ont.datasets.find((d) => d.name === t.dataset);
  const mt = t.metric ? D.ont.metrics.find((m) => m.name === t.metric) : null;
  const rels = D.ont.relationships.filter((r) => r.from === t.dataset || r.to === t.dataset);
  return { term: t, dataset: ds, metric: mt, relationships: rels };
}
function coverage(q) {
  const terms = searchTerms(q, 8), gaps = gapsIn(q);
  const cov = terms.length && !gaps.length ? 1 : terms.length ? terms.length / (terms.length + gaps.length) : 0;
  return { coverage: cov, terms, gaps };
}

// ================================================================ AI: vòng retrieve → run_sql → submit (theo Auto Ontology)
// Chạy được với mọi nền tảng AI trên máy (Claude Code, Codex, Gemini, Ollama, khoá API…): mỗi lượt AI trả MỘT hành động JSON,
// app thực hiện hành động rồi gửi kết quả ở lượt sau. Kết nối AI do máy chủ cục bộ giữ (server/drivers.mjs), không qua máy chủ nào khác.
const ai = {
  cfg: null, engines: [], loaded: false,
  async refresh(full = true) {
    try { this.cfg = await api("/api/config"); if (full) this.engines = await api("/api/engines"); this.loaded = true; }
    catch { this.cfg = this.cfg || { engine: "" }; }
    paintStatus();
  },
  engine() { return this.engines.find((e) => e.id === this.cfg?.engine) || null; },
  ready() { const e = this.engine(); return Boolean(e && e.installed && e.loggedIn); },
  configured() { return Boolean(this.cfg?.engine); },
  label() { const e = this.engine(); if (!this.cfg?.engine) return "AI: chưa chọn"; if (!this.loaded) return "AI: đang kiểm tra"; return (e ? e.name.replace(/ \(.*\)$/, "") : this.cfg.engine) + (this.ready() ? "" : " (chưa sẵn sàng)"); },
};
const ACTIONS = `Mỗi lượt chỉ trả về MỘT khối JSON là MỘT HÀNH ĐỘNG, không viết gì khác:
{"action":"retrieve","query":"<cụm từ nghiệp vụ, ví dụ: lãi suất qua đêm, áp lực tỷ giá>"}
  → tìm khái niệm, bảng, cột, chỉ số (kèm SQL mẫu), quan hệ trong ontology. Gọi trước khi viết SQL; gọi lại khi thiếu.
{"action":"run_sql","sql":"<một câu SELECT DuckDB trên các bảng đã retrieve>"}
  → trả tối đa 50 dòng.
{"action":"submit","answer":"<trả lời tiếng Việt, mọi con số lấy từ kết quả SQL, nêu ngày số liệu>","sql":"<câu SQL cuối tạo ra số>","steps":["<bước ngắn>"],"answerable":true}
  → nộp câu trả lời cuối; answerable=false nếu dữ liệu không trả lời được.`;
function systemPrompt() {
  const cat = D.ont.datasets.map((d) => `- ${d.name}: ${d.label} (${d.grain}); cột: ${d.fields.map((f) => `${f.name} ${f.type}`).join(", ")}`).join("\n");
  const fresh = [`tỷ giá trung tâm mới nhất ${DMY(M.last?.ngay)}`, `liên ngân hàng mới nhất ${DMY(M.ibL)}`, `OMO mới nhất ${DMY(M.omoL)}`, `CPI mới nhất ${M.cpiL ? MY(M.cpiL.thang) : "—"}`].join("; ");
  return `Bạn là chuyên viên phân tích của một Giám đốc tài chính (CFO) doanh nghiệp sản xuất xuất khẩu ở Việt Nam (thu USD từ xuất khẩu, nhập nguyên liệu bằng USD, vay VND và USD).
Trả lời bằng tiếng Việt, thẳng, ngắn, như một chuyên gia. Hôm nay là ${DMY(todayVN())}. Độ mới số liệu: ${fresh}.

Quy trình bắt buộc (giống NVIDIA Auto Ontology):
1. retrieve các khái niệm nghiệp vụ trong câu hỏi. Chỉ dùng bảng và chỉ số mà retrieve trả về.
2. run_sql để xem giá trị và kiểm tra bản nháp (DuckDB: có MEDIAN, arg_min, last(... ORDER BY ...), window function).
3. submit: answer, sql cuối cùng, steps.
Quy tắc: mọi con số trong answer phải đến từ kết quả SQL, ghi ngày của số liệu. Ưu tiên chỉ số đã định nghĩa trong ontology. Cảnh báo rủi ro nhân dòng khi ghép bảng theo ngày. Nếu dữ liệu không có khái niệm cần thiết (ví dụ giá vàng, tín dụng, doanh thu công ty), submit với answerable=false, nói rõ thiếu gì và gợi ý câu hỏi trả lời được. Không khuyến nghị mua bán ngoại tệ cụ thể; có thể nêu hàm ý và câu hỏi kiểm soát cho doanh nghiệp.

Danh mục bảng:
${cat}

HÀNH ĐỘNG
${ACTIONS}`;
}
// Lấy khối JSON đầu tiên trong câu trả lời của CLI (có thể kèm lời dẫn, ```json, dấu phẩy thừa)
function parseAction(raw) {
  let s = String(raw || "");
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence && fence[1].includes("{")) s = fence[1];
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) { end = i; break; }
  }
  const body = end > 0 ? s.slice(start, end + 1) : s.slice(start);
  for (const f of [(x) => x, (x) => x.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"')]) { try { return JSON.parse(f(body)); } catch { /* thử cách khác */ } }
  return null;
}
async function agent(question, ui) {
  const shown = new Set(), steps = [], transcript = [];
  let final = null, lastSQL = null, bad = 0;
  for (let i = 0; i < CFG.maxSteps && !final; i++) {
    ui.status(`Bước ${i + 1}: ${ai.engine()?.name || "AI"} đang suy luận…`);
    const prompt = `${systemPrompt()}\n\nCÂU HỎI CỦA CFO: ${question}\n\n${transcript.join("\n\n")}\n\nTrả về HÀNH ĐỘNG tiếp theo (một khối JSON).`;
    const { text, engine } = await api("/api/ai/run", { prompt });
    const act = parseAction(text);
    if (!act?.action) {
      if (++bad >= 2) { final = { answer: String(text || "").trim().slice(0, 4000) || "AI không trả lời.", steps, sql: lastSQL, answerable: true }; break; }
      transcript.push(`HÀNH ĐỘNG CỦA BẠN: (không đọc được)\nKẾT QUẢ CÔNG CỤ: {"error":"Hãy trả về đúng MỘT khối JSON theo mẫu HÀNH ĐỘNG."}`);
      continue;
    }
    let out;
    try {
      if (act.action === "retrieve") {
        const terms = searchTerms(String(act.query || question), 5);
        terms.forEach((t) => shown.add(t.dataset));
        const det = terms.map(termDetail);
        det.forEach((d) => d.relationships.forEach((r) => { shown.add(r.from); shown.add(r.to); }));
        out = { terms: det.map((d) => ({ khai_niem: d.term.ten, mo_ta: d.term.mo_ta, bang: d.dataset?.name, cot: d.term.cot, loc: d.term.loc, chi_so: d.metric ? { ten: d.metric.name, sql: d.metric.sql, don_vi: d.metric.unit } : null, cot_cua_bang: d.dataset?.fields.map((f) => `${f.name} ${f.type}: ${f.mo_ta}`), quan_he: d.relationships.map((r) => `${r.from}.${r.from_columns} → ${r.to}.${r.to_columns} (${r.cardinality}; ${r.note})`) })), khong_co_trong_du_lieu: gapsIn(String(act.query || "")) };
        steps.push(`retrieve "${act.query}" → ${terms.map((t) => t.ten).join(", ") || "không có khái niệm khớp"}`);
      } else if (act.action === "run_sql") {
        const r = await runSQL(String(act.sql || ""), { limit: 50, allowed: shown, onStatus: ui.status });
        lastSQL = act.sql;
        out = { columns: r.columns, rows: r.rows, row_count: r.row_count, truncated: r.truncated };
        steps.push(`run_sql → ${r.row_count} dòng`);
      } else if (act.action === "submit") {
        final = { answer: String(act.answer || ""), sql: act.sql || lastSQL, steps: Array.isArray(act.steps) ? act.steps : [], answerable: act.answerable !== false, engine };
        break;
      } else out = { error: `Hành động ${act.action} không có. Chỉ dùng retrieve, run_sql, submit.` };
    } catch (e) {
      out = { error: String(e.message || e) };
      steps.push(`${act.action} lỗi: ${out.error}`);
    }
    ui.step(steps.at(-1));
    transcript.push(`HÀNH ĐỘNG CỦA BẠN: ${JSON.stringify(act)}\nKẾT QUẢ CÔNG CỤ: ${JSON.stringify(out).slice(0, 12000)}`);
  }
  if (!final) final = { answer: "Chưa đi đến câu trả lời sau số bước cho phép. Hãy hỏi cụ thể hơn.", steps, sql: lastSQL, answerable: false };
  final.steps = [...steps, ...(final.steps || []).map((x) => "↳ " + x)];
  final.used = [...shown];
  return final;
}
function answerCard({ answer, sql, steps, rows, used, answerable, engine }) {
  const lineage = (used || []).map((n) => D.ont.datasets.find((d) => d.name === n)).filter(Boolean);
  return el("div", { class: "ans" },
    el("div", { class: "row" }, el("div", { class: "lab" }, "Trả lời"), el("div", {}, el("p", { class: answerable === false ? "warn" : "" }, answer))),
    sql ? el("div", { class: "row" }, el("div", { class: "lab" }, "SQL"), el("pre", {}, sql)) : null,
    rows ? el("div", { class: "row" }, el("div", { class: "lab" }, "Dữ liệu"), el("div", {}, rows)) : null,
    steps?.length ? el("div", { class: "row" }, el("div", { class: "lab" }, "Các bước"), el("ol", {}, steps.map((s) => el("li", {}, s)))) : null,
    lineage.length ? el("div", { class: "row" }, el("div", { class: "lab" }, "Nguồn"), el("div", {}, lineage.map((d) => el("div", {}, el("span", { class: "tag" }, d.name), el("a", { href: d.lineage.url, target: "_blank", rel: "noopener" }, d.lineage.nguon))))) : null,
    engine ? el("div", { class: "row" }, el("div", { class: "lab" }, "AI"), el("div", { class: "muted" }, ai.engines.find((e) => e.id === engine)?.name || engine)) : null);
}

// ================================================================ tác động doanh nghiệp
const IMPACT_KEYS = { ar: "Phải thu USD (tr USD)", cash: "Tiền gửi USD (tr USD)", ap: "Phải trả USD (tr USD)", lusd: "Vay USD (tr USD)", lvnd: "Vay VND (tỷ đ)", rev: "Doanh thu năm (tỷ đ)" };
const IMPACT_DEF = { ar: 6, cash: 1, ap: 4, lusd: 2, lvnd: 250, rev: 900 };
function impactRows(v, extra = []) {
  const rate = M.last?.ty_gia || 0, perMio = rate / 1000, net = v.ar + v.cash - v.ap - v.lusd;
  const sc = [["VND tăng giá 1%", -1, "fx"], ["USD tăng 1%", 1, "fx"], ["USD tăng bằng mức từ đầu năm", M.ytd, "fx"], ["Giá bán USD lên chạm trần biên độ", M.bandL?.du_dia, "fx"], ["Lãi suất vay VND +1 điểm", 1, "ir"], ["Lãi suất vay VND +2 điểm", 2, "ir"], ...extra];
  return { net, perMio, rate, rows: sc.map(([k, d, kind]) => { const imp = d == null ? null : kind === "fx" ? net * perMio * d / 100 : -v.lvnd * d / 100; return { k, d, kind, imp, pct: imp == null || !v.rev ? null : imp / v.rev * 100 }; }) };
}
const impactTable = (rows) => table([{ l: "Kịch bản", k: "k" }, { l: "Biến động", n: 1, f: (r) => r.d == null ? "—" : S(r.d, 2) + (r.kind === "fx" ? "%" : " điểm") }, { l: "Tác động (tỷ đ)", n: 1, f: (r) => S(r.imp, 2), cls: (r) => r.imp == null ? "" : r.imp < 0 ? "bad" : "ok" }, { l: "% doanh thu", n: 1, f: (r) => r.pct == null ? "—" : S(r.pct, 2) + "%", cls: (r) => r.imp == null ? "" : r.imp < 0 ? "bad" : "ok" }], rows);
function parseKV(args) { const o = {}; for (const a of args) { const m = a.match(/^([a-z]+)\s*=\s*([+-]?[\d.,]+)$/i); if (m) o[m[1].toLowerCase()] = parseFloat(m[2].replace(",", ".")); } return o; }

// ================================================================ báo cáo CFO
function memo() {
  const s = signals(), b = M.bandL;
  const L = [];
  L.push(`# Bản tin tiền tệ cho CFO – ${DMY(todayVN())}`, "");
  L.push(`Nguồn: NHNN (tỷ giá trung tâm, tỷ giá tham khảo, liên ngân hàng, OMO, lãi suất điều hành, CPI) và giá niêm yết 16 ngân hàng. Tạo bởi CFO Terminal.`, "");
  L.push("## Điểm chính");
  if (M.last) L.push(`- Tỷ giá trung tâm ${DMY(M.last.ngay)}: **${N(M.last.ty_gia)} đ** (${S(M.dDay)} đ so với phiên trước; ${S(M.ytd, 2)}% từ đầu năm).`);
  if (b) L.push(`- Giá bán USD trung vị ngân hàng: **${N(b.ban)} đ**, đã dùng **${N(b.vi_tri, 0)}%** biên độ trên, còn ${N(b.du_dia, 1)}% đến trần ${N(b.tran)} đ.${M.bandMax ? ` Đỉnh năm nay ${N(M.bandMax.vi_tri, 0)}% (${DMY(M.bandMax.ngay)}).` : ""}`);
  if (M.refL) L.push(`- NHNN niêm yết mua/bán USD: ${N(M.refL.mua)} / ${N(M.refL.ban)} đ (${DMY(M.refL.ngay)}).`);
  if (M.on != null) L.push(`- Lãi suất qua đêm ${DMY(M.ibL)}: **${N(M.on, 2)}%** (${S(M.on - M.onPrev, 2)} điểm); OMO ${N(M.omoRate, 2)}%; chênh ${S(M.spread, 2)} điểm.`);
  if (M.omoL) L.push(`- OMO phiên ${DMY(M.omoL)}: trúng thầu ${N(M.omoVol, 0)} tỷ đ.`);
  if (M.cpiL) L.push(`- CPI ${MY(M.cpiL.thang)}: ${N(M.cpiL.cpi_yoy, 2)}% so với cùng kỳ${M.cpiBq ? `; bình quân ${N(M.cpiBq.cpi_binh_quan, 2)}% (mục tiêu 4,5%)` : ""}. Lãi suất điều hành thực ${S(M.real, 2)} điểm.`);
  L.push("", "## Tín hiệu");
  s.forEach((x) => L.push(`- [${x.muc === "bad" ? "Rủi ro" : x.muc === "warn" ? "Theo dõi" : "Ổn"}] ${x.nhom} – ${x.ten}: ${x.chi_tiet}`));
  const v = { ...IMPACT_DEF, ...store.get("impact", {}) };
  const im = impactRows(v);
  L.push("", `## Tác động lên doanh nghiệp${store.get("impact", null) ? "" : " (số minh hoạ – chưa nhập số dư thật)"}`);
  L.push(`Trạng thái USD ròng ${S(im.net, 2)} triệu USD.`, "", "| Kịch bản | Biến động | Tác động (tỷ đ) | % doanh thu |", "|---|---:|---:|---:|");
  im.rows.forEach((r) => L.push(`| ${r.k} | ${r.d == null ? "—" : S(r.d, 2) + (r.kind === "fx" ? "%" : " điểm")} | ${S(r.imp, 2)} | ${r.pct == null ? "—" : S(r.pct, 2) + "%"} |`));
  L.push("", "## Câu hỏi cho Ban điều hành");
  s.filter((x) => x.cau_hoi).forEach((x, i) => L.push(`${i + 1}. (${x.nhom}) ${x.cau_hoi}`));
  L.push("", "_Đây là câu hỏi kiểm soát, không phải khuyến nghị giao dịch._");
  return L.join("\n");
}

// ================================================================ lệnh
const COMMANDS = [];
const def = (name, aliases, group, args, desc, run) => COMMANDS.push({ name, aliases, group, args, desc, run });

def("trogiup", ["help", "?", "h", "tro-giup"], "Hệ thống", "", "Danh sách lệnh và cách dùng", (a, out) => {
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
  out.append(P("Gõ tên lệnh (không cần dấu) hoặc hỏi thẳng bằng tiếng Việt. Ví dụ: ", link("biendo"), ", ", link("tygia ytd"), ", ", link("hoi lãi suất qua đêm tuần này so với OMO thế nào?")));
  out.append(el("div", { class: "cmds" }, groups.flatMap((g) => [el("div", { class: "g" }, g), ...COMMANDS.filter((c) => c.group === g).flatMap((c) => [el("div", { class: "c" }, link(c.name, c.name + (c.args ? " " + c.args : ""))), el("div", { class: "d" }, c.desc)])])));
});

def("tongquan", ["tq", "overview", "tong-quan"], "Phân tích", "", "Toàn cảnh tiền tệ hôm nay, các chỉ số chính và tín hiệu", (a, out) => {
  need();
  const b = M.bandL, lead = [];
  if (M.last) lead.push(`Tỷ giá trung tâm ${DMY(M.last.ngay)} là `, el("b", { class: "k" }, N(M.last.ty_gia) + " đ"), ` (${S(M.dDay)} đ, ${S(M.ytd, 2)}% từ đầu năm). `);
  if (b) lead.push("Giá bán USD của ngân hàng mới dùng ", el("b", { class: b.vi_tri >= 80 ? "bad" : b.vi_tri >= 50 ? "warn" : "ok" }, N(b.vi_tri, 0) + "%"), " biên độ trên. ");
  if (M.on != null) lead.push(`Lãi suất qua đêm ${N(M.on, 2)}%, `, M.spread > 0.5 ? "thanh khoản đang căng. " : "thanh khoản không căng. ");
  if (M.real != null) lead.push("Lãi suất điều hành thực ", el("b", { class: M.real < 0 ? "warn" : "ok" }, S(M.real, 2) + " điểm"), ".");
  out.append(el("p", { class: "lead" }, lead));
  out.append(el("div", { class: "kpis" },
    M.last && kpi("Tỷ giá trung tâm", N(M.last.ty_gia), "đ/USD", `${S(M.dDay)} đ · ${DMY(M.last.ngay)}`),
    b && kpi("Áp lực tỷ giá", N(b.vi_tri, 0) + "%", "biên độ trên", `NHTM bán ${N(b.ban)} · trần ${N(b.tran)}`, b.vi_tri >= 80 ? "bad" : b.vi_tri >= 50 ? "warn" : "ok"),
    M.refL && kpi("NHNN mua / bán USD", N(M.refL.mua), "/ " + N(M.refL.ban), `tỷ giá tham khảo ${DMY(M.refL.ngay)}`),
    M.on != null && kpi("Lãi suất qua đêm", N(M.on, 2), "%/năm", `${S(M.on - M.onPrev, 2)} điểm · ${DMY(M.ibL)}`),
    M.omoL && kpi("OMO phiên gần nhất", N(M.omoRate, 2), "%/năm", `${N(M.omoVol, 0)} tỷ đ · ${DMY(M.omoL)}`),
    M.cpiL && kpi("CPI so với cùng kỳ", N(M.cpiL.cpi_yoy, 2), "%", `tháng ${MY(M.cpiL.thang)}${M.cpiBq ? ` · BQ ${N(M.cpiBq.cpi_binh_quan, 2)}%` : ""}`),
    M.real != null && kpi("Lãi suất thực", S(M.real, 2), "điểm", "OMO trừ CPI", M.real < 0 ? "warn" : "ok"),
    M.refi && kpi("Tái cấp vốn / chiết khấu", N(M.refi.gia_tri, 1) + "%", "/ " + N(M.redis?.gia_tri, 1) + "%", `từ ${DMY(M.refi.ap_dung)}`)));
  const s = signals().filter((x) => x.muc !== "ok");
  if (s.length) { out.append(H("Cần chú ý")); out.append(el("div", {}, s.map((x) => el("p", {}, el("span", { class: x.muc }, "● "), el("span", { class: "tag" }, x.nhom), el("b", {}, x.ten), " – ", x.chi_tiet)))); }
  out.append(next("biendo", "laisuat", "nganhang", "tacdong", "baocao"));
});

def("tygia", ["tg", "ty-gia"], "Phân tích", "[90|ytd|1y|3y|all]", "Tỷ giá trung tâm, trần biên độ và giá bán NHTM theo thời gian", (a, out) => {
  need(); const r = range(a[0], "ytd"), from = cut(r, M.last.ngay);
  const c = D.t.ty_gia_trung_tam.filter((x) => T(x.ngay) >= from);
  const ch = (n) => { const x = M.ago(n); return x ? M.last.ty_gia - x.ty_gia : null; };
  out.append(el("div", { class: "kpis" }, kpi("Hôm nay", N(M.last.ty_gia), "đ/USD", DMY(M.last.ngay)), kpi("So với phiên trước", S(M.dDay), "đ"), kpi("7 ngày", S(ch(7)), "đ"), kpi("30 ngày", S(ch(30)), "đ"), kpi("Từ đầu năm", S(M.ytd, 2) + "%", "", `từ ${N(M.yStart?.ty_gia)} đ`)));
  out.append(lineChart({ label: "Tỷ giá trung tâm, trần và giá NHTM", fmt: (v) => N(v), left: 56, series: [
    { name: "Trần ×1,05", color: "--c5", dash: "5 4", w: 1.4, pts: c.map((x) => [T(x.ngay), x.ty_gia * 1.05]) },
    { name: "Giá bán NHTM (trung vị)", color: "--c2", pts: M.bank.filter((x) => T(x.ngay) >= from && x.ban).map((x) => [T(x.ngay), x.ban]) },
    { name: "Tỷ giá trung tâm", color: "--c1", pts: c.map((x) => [T(x.ngay), x.ty_gia]) },
    { name: "NHNN mua vào", color: "--c3", w: 1.4, pts: D.t.ty_gia_tham_khao.filter((x) => x.ngoai_te === "USD" && T(x.ngay) >= from).map((x) => [T(x.ngay), x.mua]) }] }));
  out.append(el("p", { class: "muted" }, `Phạm vi: ${rangeLabel(r)}. 10 phiên gần nhất:`));
  const last10 = D.t.ty_gia_trung_tam.slice(-10).reverse();
  out.append(table([{ l: "Ngày", f: (x) => DMY(x.ngay) }, { l: "Tỷ giá TT", n: 1, f: (x) => N(x.ty_gia) }, { l: "±", n: 1, f: (x) => { const i = D.t.ty_gia_trung_tam.indexOf(x); return i > 0 ? S(x.ty_gia - D.t.ty_gia_trung_tam[i - 1].ty_gia) : "—"; } }, { l: "Trần", n: 1, f: (x) => N(x.ty_gia * 1.05) }, { l: "Số văn bản", k: "so_van_ban" }], last10));
  out.append(next("biendo", "nganhang", "tygia 1y", "sql SELECT * FROM ty_gia_trung_tam ORDER BY ngay DESC LIMIT 20"));
});

def("biendo", ["apluc", "bd", "bien-do", "ap-luc"], "Phân tích", "[ytd|1y|all]", "Áp lực tỷ giá: giá bán USD dùng bao nhiêu biên độ trên", (a, out) => {
  need(); const b = M.bandL; if (!b) throw new Error("Chưa ghép được giá ngân hàng với tỷ giá trung tâm.");
  out.append(el("p", { class: "lead" }, `Ngày ${DMY(b.ngay)}: giá bán USD trung vị `, el("b", { class: "k" }, N(b.ban) + " đ"), " so với tỷ giá trung tâm ", N(b.ty_gia), " và trần ", N(b.tran), " → đã dùng ", el("b", { class: b.vi_tri >= 80 ? "bad" : b.vi_tri >= 50 ? "warn" : "ok" }, N(b.vi_tri, 1) + "%"), " biên độ trên, còn ", N(b.du_dia, 1), "% đến trần."));
  out.append(gauge(b.vi_tri));
  const r = range(a[0], "ytd"), from = cut(r, b.ngay);
  const ser = M.band.filter((x) => T(x.ngay) >= from);
  out.append(lineChart({ label: "Vị trí trong biên độ trên", fmt: (v) => N(v, 0), unit: "%", left: 40, y0: Math.min(0, ...ser.map((x) => x.vi_tri)), refs: [{ y: 100, label: "Trần" }, { y: 50, label: "50%" }], series: [{ name: "Đã dùng", color: "--c1", pts: ser.map((x) => [T(x.ngay), x.vi_tri]) }] }));
  const over80 = ser.filter((x) => x.vi_tri >= 80).length;
  out.append(P(el("span", { class: "muted" }, `Giai đoạn ${rangeLabel(r)}: `), `cao nhất ${N(M.bandMax?.vi_tri, 0)}% (${DMY(M.bandMax?.ngay)}), thấp nhất ${N(M.bandMin?.vi_tri, 0)}% (${DMY(M.bandMin?.ngay)}); ${over80}/${ser.length} phiên trên 80%.`));
  if (M.refL) out.append(P(el("span", { class: "muted" }, "NHNN niêm yết mua USD ở "), el("b", {}, N(M.refL.mua) + " đ"), el("span", { class: "muted" }, ` (${DMY(M.refL.ngay)}). Giá thị trường càng gần mức này, NHNN càng có dư địa mua vào bồi đắp dự trữ.`)));
  out.append(el("p", { class: "muted" }, "Lưu ý: lịch sử giá ngân hàng trước tháng 11/2026 lấy từ bộ cào ngân hàng, có ngày được ngoại suy; coi là ước lượng."));
  out.append(next("nganhang", "tacdong", "dinhnghia áp lực tỷ giá"));
});

def("nganhang", ["nh", "bank", "ngan-hang", "usd"], "Phân tích", "", "Giá mua/bán USD hôm nay ở 16 ngân hàng, chỗ bán USD có lợi nhất", (a, out) => {
  need(); const d = D.t.gia_usd_ngan_hang.at(-1)?.ngay; const rows = D.t.gia_usd_ngan_hang.filter((x) => x.ngay === d).sort((x, y) => (y.mua_chuyen_khoan || 0) - (x.mua_chuyen_khoan || 0));
  const tt = M.cmap[d];
  const bestBuy = rows[0], bestSell = [...rows].sort((x, y) => (x.ban || 1e9) - (y.ban || 1e9))[0];
  out.append(el("p", { class: "lead" }, `Ngày ${DMY(d)}${D.raw.live?.timestamp ? ` (cập nhật ${new Date(D.raw.live.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })})` : ""}: bán USD thu từ xuất khẩu được giá cao nhất tại `, el("b", { class: "k" }, bestBuy?.ngan_hang), ` (${N(bestBuy?.mua_chuyen_khoan)} đ chuyển khoản); mua USD rẻ nhất tại `, el("b", { class: "k" }, bestSell?.ngan_hang), ` (${N(bestSell?.ban)} đ).`));
  out.append(table([{ l: "Ngân hàng", k: "ngan_hang" }, { l: "Mua TM", n: 1, f: (x) => N(x.mua_tien_mat) }, { l: "Mua CK", n: 1, f: (x) => N(x.mua_chuyen_khoan), cls: (x) => x === bestBuy ? "ok" : "" }, { l: "Bán", n: 1, f: (x) => N(x.ban), cls: (x) => x === bestSell ? "ok" : "" }, { l: "Bán − TT", n: 1, f: (x) => tt ? S(x.ban - tt) : "—" }, { l: "Chênh mua–bán", n: 1, f: (x) => N(x.ban - x.mua_chuyen_khoan) }], rows));
  if (rows.length) out.append(P(el("span", { class: "muted" }, `Chênh lệch giá mua CK giữa ngân hàng tốt nhất và kém nhất: ${N(rows[0].mua_chuyen_khoan - rows.at(-1).mua_chuyen_khoan)} đ/USD — với 1 triệu USD là ${N((rows[0].mua_chuyen_khoan - rows.at(-1).mua_chuyen_khoan) / 1000, 1)} triệu đồng.`)));
  out.append(next("biendo", "tacdong"));
});

def("laisuat", ["ls", "lai-suat", "lien-ngan-hang"], "Phân tích", "[90|ytd|1y]", "Lãi suất liên ngân hàng, đường cong kỳ hạn, hành lang OMO – tái cấp vốn", (a, out) => {
  need(); const last = M.ib[M.ibL]; if (!last) throw new Error("Chưa có số liệu liên ngân hàng.");
  const tenors = ["ON", "1W", "2W", "1M", "3M", "6M", "9M"], lbl = { ON: "Qua đêm", "1W": "1 tuần", "2W": "2 tuần", "1M": "1 tháng", "3M": "3 tháng", "6M": "6 tháng", "9M": "9 tháng" };
  const near = (n) => { const tgt = T(M.ibL) - n * 864e5; const d = [...M.ibDays].reverse().find((x) => T(x) <= tgt); return d ? M.ib[d] : null; };
  const w1 = near(7), m1 = near(30);
  out.append(el("p", { class: "lead" }, `Phiên ${DMY(M.ibL)}: qua đêm `, el("b", { class: "k" }, N(M.on, 2) + "%"), ` (${S(M.on - M.onPrev, 2)} điểm), OMO ${N(M.omoRate, 2)}%, tái cấp vốn ${N(M.refi?.gia_tri, 1)}%. `, M.spread != null ? (M.spread > 0.5 ? el("span", { class: "warn" }, "Qua đêm cao hơn OMO rõ – thanh khoản căng.") : el("span", { class: "ok" }, "Qua đêm sát OMO – thanh khoản không căng.")) : ""));
  out.append(table([{ l: "Kỳ hạn", f: (t) => lbl[t] }, { l: DMY(M.ibL), n: 1, f: (t) => N(last[t]?.lai_suat, 2) }, { l: "1 tuần trước", n: 1, f: (t) => w1?.[t] ? S(last[t]?.lai_suat - w1[t].lai_suat, 2) : "—" }, { l: "1 tháng trước", n: 1, f: (t) => m1?.[t] ? S(last[t]?.lai_suat - m1[t].lai_suat, 2) : "—" }, { l: "Doanh số (tỷ đ)", n: 1, f: (t) => N(last[t]?.doanh_so) }, { l: "Ghi chú", f: (t) => last[t]?.ghi_chu || "" }], tenors.filter((t) => last[t])));
  const r = range(a[0], 183), from = cut(r, M.ibL), ds = M.ibDays.filter((d) => T(d) >= from);
  const refs = []; if (M.omoRate != null) refs.push({ y: M.omoRate, label: "OMO " + N(M.omoRate, 2) + "%" }); if (M.refi) refs.push({ y: M.refi.gia_tri, label: "Tái cấp vốn " + N(M.refi.gia_tri, 1) + "%" });
  out.append(lineChart({ label: "Lãi suất liên ngân hàng", fmt: (v) => N(v, 1), unit: "%", left: 36, y0: 0, gapDays: 6, refs, series: [
    { name: "Qua đêm", color: "--c1", pts: ds.filter((d) => M.ib[d].ON).map((d) => [T(d), M.ib[d].ON.lai_suat]) },
    { name: "1 tuần", color: "--c2", w: 1.4, pts: ds.filter((d) => M.ib[d]["1W"]).map((d) => [T(d), M.ib[d]["1W"].lai_suat]) },
    { name: "1 tháng", color: "--c4", w: 1.4, pts: ds.filter((d) => M.ib[d]["1M"]).map((d) => [T(d), M.ib[d]["1M"].lai_suat]) }] }));
  out.append(el("p", { class: "muted" }, `Phạm vi: ${rangeLabel(r)}. Liên ngân hàng có từ ${DMY(M.ibDays[0])}.`));
  out.append(next("thanhkhoan", "omo", "hoi lãi suất qua đêm trung bình tháng này so với tháng trước?"));
});

def("thanhkhoan", ["tk", "thanh-khoan", "doanhso"], "Phân tích", "", "Doanh số giao dịch qua đêm 60 phiên và mức căng thanh khoản", (a, out) => {
  need(); const ds = M.ibDays.slice(-60).filter((d) => M.ib[d].ON);
  const avg = ds.reduce((s, d) => s + M.ib[d].ON.doanh_so, 0) / ds.length;
  out.append(el("p", { class: "lead" }, `Doanh số qua đêm phiên ${DMY(M.ibL)}: `, el("b", { class: "k" }, N(M.onVol / 1000, 0) + " nghìn tỷ đ"), M.tb20 ? ` (${S((M.onVol / M.tb20 - 1) * 100, 0)}% so với trung bình 20 phiên).` : "."));
  out.append(barChart({ label: "Doanh số qua đêm", fmt: (v) => N(v, 0), unit: " nghìn tỷ", vals: ds.map((d) => ({ v: M.ib[d].ON.doanh_so / 1000, label: DMY(d).slice(0, 5), title: `${DMY(d)} · LS ${N(M.ib[d].ON.lai_suat, 2)}%`, color: M.ib[d].ON.doanh_so > avg * 1.3 ? "--c2" : "--c1" })) }));
  out.append(el("p", { class: "muted" }, "Cột cam: phiên có doanh số cao hơn 30% mức trung bình 60 phiên. Doanh số và lãi suất cùng tăng vọt = ngân hàng thiếu vốn ngắn hạn."));
  out.append(next("laisuat", "omo"));
});

def("omo", ["thitruongmo", "om"], "Phân tích", "", "Kết quả đấu thầu thị trường mở gần nhất và lịch sử đã lưu", (a, out) => {
  need(); if (!M.omoL) throw new Error("Chưa có phiên OMO nào.");
  out.append(el("p", { class: "lead" }, `Phiên ${DMY(M.omoL)}: NHNN cho vay qua OMO `, el("b", { class: "k" }, N(M.omoVol, 2) + " tỷ đ"), `, lãi suất ${N(M.omoRate, 2)}%.`));
  out.append(table([{ l: "Lượt", k: "luot" }, { l: "Loại", k: "loai_giao_dich" }, { l: "Kỳ hạn", f: (r) => r.ky_han_ngay + " ngày" }, { l: "Trúng/tham gia", n: 1, f: (r) => `${r.so_trung_thau}/${r.so_tham_gia}` }, { l: "Khối lượng (tỷ đ)", n: 1, f: (r) => N(r.khoi_luong, 2) }, { l: "Lãi suất", n: 1, f: (r) => r.lai_suat ? N(r.lai_suat, 2) + "%" : "—" }], M.omoRows));
  const hist = M.omoDays.map((d) => ({ d, v: D.t.omo.filter((r) => r.ngay === d).reduce((s, r) => s + r.khoi_luong, 0) })).reverse();
  out.append(H(`Lịch sử đã lưu (${hist.length} phiên)`));
  out.append(table([{ l: "Ngày", f: (r) => DMY(r.d) }, { l: "Tổng trúng thầu (tỷ đ)", n: 1, f: (r) => N(r.v, 2) }], hist.slice(0, 20)));
  out.append(el("p", { class: "muted" }, "NHNN chỉ hiện phiên mới nhất nên lịch sử OMO bắt đầu từ ngày bộ cào chạy (26/11/2026)."));
});

def("cpi", ["lamphat", "lam-phat"], "Phân tích", "", "Lạm phát, lạm phát cơ bản, so với mục tiêu và lãi suất thực", (a, out) => {
  need(); const rows = D.t.cpi.filter((r) => r.cpi_yoy != null || r.co_ban_yoy != null);
  out.append(el("p", { class: "lead" }, `CPI ${MY(M.cpiL?.thang)}: `, el("b", { class: "k" }, N(M.cpiL?.cpi_yoy, 2) + "%"), " so với cùng kỳ", M.cpiBq ? `; bình quân ${N(M.cpiBq.cpi_binh_quan, 2)}% so với mục tiêu 4,5%` : "", `. Lãi suất điều hành thực `, el("b", { class: M.real < 0 ? "warn" : "ok" }, S(M.real, 2) + " điểm"), "."));
  out.append(lineChart({ label: "CPI so với cùng kỳ", fmt: (v) => N(v, 1), unit: "%", left: 34, y0: 0, gapDays: 40, refs: [{ y: 4.5, label: "Mục tiêu 4,5%" }], series: [
    { name: "CPI", color: "--c1", pts: rows.filter((r) => r.cpi_yoy != null).map((r) => [T(r.thang), r.cpi_yoy]) },
    { name: "Lạm phát cơ bản", color: "--c2", pts: rows.filter((r) => r.co_ban_yoy != null).map((r) => [T(r.thang), r.co_ban_yoy]) }] }));
  out.append(table([{ l: "Tháng", f: (r) => MY(r.thang) }, { l: "So cùng kỳ", n: 1, f: (r) => N(r.cpi_yoy, 2) }, { l: "So tháng trước", n: 1, f: (r) => N(r.cpi_mom, 2) }, { l: "Bình quân", n: 1, f: (r) => N(r.cpi_binh_quan, 2) }, { l: "Cơ bản (cùng kỳ)", n: 1, f: (r) => N(r.co_ban_yoy, 2) }], [...D.t.cpi].reverse()));
});

def("thamkhao", ["tham-khao", "qlnh"], "Phân tích", "", "Tỷ giá tham khảo 7 ngoại tệ tại Cục Quản lý ngoại hối", (a, out) => {
  need(); const d = D.t.ty_gia_tham_khao.at(-1)?.ngay; const rows = D.t.ty_gia_tham_khao.filter((r) => r.ngay === d);
  const prevD = [...new Set(D.t.ty_gia_tham_khao.map((r) => r.ngay))].filter((x) => x < d).at(-1);
  const pv = Object.fromEntries(D.t.ty_gia_tham_khao.filter((r) => r.ngay === prevD).map((r) => [r.ngoai_te, r]));
  out.append(P(`Áp dụng ngày ${DMY(d)}, so với ${DMY(prevD)}:`));
  out.append(table([{ l: "Ngoại tệ", k: "ngoai_te" }, { l: "Mua", n: 1, f: (r) => N(r.mua, r.mua < 1000 ? 2 : 0) }, { l: "Bán", n: 1, f: (r) => N(r.ban, r.ban < 1000 ? 2 : 0) }, { l: "± bán", n: 1, f: (r) => pv[r.ngoai_te] ? S(r.ban - pv[r.ngoai_te].ban, r.ban < 1000 ? 2 : 0) : "—" }], rows));
});

def("tacdong", ["td", "tac-dong", "impact"], "Doanh nghiệp", "[ar= ap= lusd= cash= lvnd= rev=]", "Tác động tỷ giá, lãi suất lên công ty (lưu số dư trên máy này)", (a, out) => {
  need(); const saved = store.get("impact", null), kv = parseKV(a);
  const v = { ...IMPACT_DEF, ...(saved || {}), ...kv };
  if (Object.keys(kv).length) store.set("impact", v);
  const im = impactRows(v);
  out.append(P(el("span", { class: "muted" }, "Số dư: "), Object.entries(IMPACT_KEYS).map(([k, l], i) => [i ? " · " : "", `${l} `, el("b", {}, N(v[k], 1))])));
  if (!saved && !Object.keys(kv).length) out.append(el("p", { class: "warn" }, "Đang dùng số minh hoạ. Nhập số dư thật, ví dụ: ", link("tacdong ar=6.5 ap=3.2 lusd=1.5 cash=0.8 lvnd=240 rev=900")));
  out.append(P(`Trạng thái USD ròng `, el("b", { class: "k" }, S(im.net, 2) + " triệu USD"), ` (${im.net >= 0 ? "USD lên thì có lãi tỷ giá" : "USD lên thì lỗ tỷ giá"}), tương đương ${N(Math.abs(im.net) * im.perMio, 1)} tỷ đ theo tỷ giá trung tâm ${N(im.rate)}.`));
  out.append(impactTable(im.rows));
  out.append(el("p", { class: "muted" }, "Tỷ giá: lãi/lỗ đánh giá lại một lần. Lãi suất: chi phí lãi vay tăng thêm trong một năm. Tự đặt kịch bản: ", link("kichban usd=3 ls=2")));
});

def("kichban", ["kb", "kich-ban", "scenario"], "Doanh nghiệp", "usd=±% ls=±điểm", "Kịch bản tuỳ chọn: USD tăng/giảm %, lãi suất VND tăng/giảm điểm", (a, out) => {
  need(); const kv = parseKV(a); if (kv.usd == null && kv.ls == null) throw new Error("Cú pháp: kichban usd=3 ls=2 (USD tăng 3%, lãi suất VND tăng 2 điểm).");
  const v = { ...IMPACT_DEF, ...store.get("impact", {}) };
  const extra = []; if (kv.usd != null) extra.push([`USD ${kv.usd >= 0 ? "tăng" : "giảm"} ${N(Math.abs(kv.usd), 1)}% (tuỳ chọn)`, kv.usd, "fx"]); if (kv.ls != null) extra.push([`Lãi suất VND ${kv.ls >= 0 ? "+" : "−"}${N(Math.abs(kv.ls), 1)} điểm (tuỳ chọn)`, kv.ls, "ir"]);
  const im = impactRows(v, extra), rows = im.rows.slice(-extra.length);
  const tot = rows.reduce((s, r) => s + (r.imp || 0), 0);
  out.append(impactTable(rows));
  out.append(P("Tổng tác động: ", el("b", { class: tot < 0 ? "bad" : "ok" }, S(tot, 2) + " tỷ đ"), v.rev ? ` (${S(tot / v.rev * 100, 2)}% doanh thu).` : "."));
  if (kv.usd != null && M.bandL) { const nv = M.bandL.ban * (1 + kv.usd / 100); out.append(el("p", { class: nv > M.bandL.tran ? "warn" : "muted" }, `USD ${S(kv.usd, 1)}% đưa giá bán lên khoảng ${N(nv)} đ, ${nv > M.bandL.tran ? "vượt trần hiện tại " + N(M.bandL.tran) + " đ – chỉ xảy ra nếu NHNN nâng tỷ giá trung tâm." : "vẫn dưới trần " + N(M.bandL.tran) + " đ."}`)); }
});

def("canhbao", ["cb", "canh-bao", "tinhieu"], "Doanh nghiệp", "", "Các tín hiệu rủi ro và điểm ổn từ số liệu hiện tại", (a, out) => {
  need(); const s = signals();
  out.append(table([{ l: "Mức", f: (x) => el("span", { class: x.muc }, x.muc === "bad" ? "● Rủi ro" : x.muc === "warn" ? "● Theo dõi" : "● Ổn") }, { l: "Nhóm", k: "nhom" }, { l: "Tín hiệu", f: (x) => el("b", {}, x.ten) }, { l: "Chi tiết", k: "chi_tiet", wrap: 1 }], s));
  out.append(next("cauhoi", "baocao"));
});

def("cauhoi", ["ch", "cau-hoi", "bdh"], "Doanh nghiệp", "", "Câu hỏi kiểm soát nên đặt cho Ban điều hành", (a, out) => {
  need(); const q = signals().filter((x) => x.cau_hoi);
  out.append(el("ol", {}, q.map((x) => el("li", { style: "margin-bottom:8px" }, el("span", { class: "tag" }, x.nhom), x.cau_hoi))));
  out.append(el("p", { class: "muted" }, "Câu hỏi kiểm soát, không phải khuyến nghị giao dịch."));
});

def("baocao", ["bc", "bao-cao", "memo"], "Doanh nghiệp", "", "Bản tin tiền tệ cho CFO (Markdown): chép, tải về, dán vào email", (a, out) => {
  need(); const md = memo();
  const b1 = el("button", { class: "btn pri", type: "button", onclick: (e) => copy(md, e.target) }, "Chép");
  out.append(el("div", { class: "acts" }, b1, el("button", { class: "btn", type: "button", onclick: () => download(`ban-tin-cfo-${todayVN()}.md`, md, "text/markdown") }, "Tải .md")));
  out.append(el("pre", { class: "code" }, md));
});

def("hoi", ["ask", "ai?"], "AI & dữ liệu", "<câu hỏi>", "Hỏi bằng tiếng Việt; AI tra ontology, viết SQL, chạy và trả lời kèm SQL, các bước, nguồn", async (a, out) => {
  need(); const q = a.join(" ").trim(); if (!q) throw new Error("Cú pháp: hoi <câu hỏi>, ví dụ: hoi lãi suất qua đêm tuần này so với OMO?");
  const cov = coverage(q);
  if (!ai.configured()) {
    out.append(el("p", { class: "muted" }, "Chưa kết nối AI nên dùng bộ định tuyến từ khoá. Kết nối AI (Claude, ChatGPT, Gemini, Ollama…): ", link("ai"), "."));
    if (cov.gaps.length && !cov.terms.length) { out.append(answerCard({ answer: `Dữ liệu hiện có không chứa: ${cov.gaps.join(", ")}. Có thể hỏi về tỷ giá, biên độ, lãi suất liên ngân hàng, OMO, CPI, giá USD các ngân hàng.`, answerable: false, steps: ["kiemtra → độ phủ " + N(cov.coverage * 100, 0) + "%"] })); return; }
    const cmd = route(q); out.append(P("→ chạy ", link(cmd))); await COMMANDS.find((c) => c.name === cmd).run([], out); return;
  }
  const live = el("ol", { class: "muted" }); const st = el("p", { class: "spin muted" }, "Đang bắt đầu…");
  out.append(st, live);
  const ui = { status: (t) => (st.textContent = t), step: (t) => live.append(el("li", {}, t)) };
  let res;
  try { res = await agent(q, ui); } finally { st.remove(); live.remove(); }
  let rows = null;
  if (res.sql) { try { const r = await runSQL(res.sql, { limit: 50 }); rows = sqlTable(r); } catch (e) { rows = el("p", { class: "err" }, "SQL cuối không chạy được: " + e.message); } }
  out.append(answerCard({ ...res, rows }));
});

def("kiemtra", ["kt", "kiem-tra", "answerable"], "AI & dữ liệu", "<câu hỏi>", "Kiểm tra dữ liệu có trả lời được câu hỏi không (độ phủ khái niệm)", (a, out) => {
  need(); const q = a.join(" "); if (!q) throw new Error("Cú pháp: kiemtra <câu hỏi>");
  const c = coverage(q);
  out.append(P("Độ phủ: ", el("b", { class: c.coverage >= .99 ? "ok" : c.coverage > 0 ? "warn" : "bad" }, N(c.coverage * 100, 0) + "%")));
  if (c.terms.length) out.append(P(el("span", { class: "muted" }, "Khái niệm khớp: "), c.terms.map((t, i) => [i ? ", " : "", link("dinhnghia " + t.ten, t.ten)])));
  if (c.gaps.length) out.append(el("p", { class: "warn" }, `Không có trong dữ liệu: ${c.gaps.join(", ")}.`));
  if (!c.terms.length && !c.gaps.length) out.append(el("p", { class: "muted" }, "Không nhận ra khái niệm nào. Xem danh sách: ", link("thuatngu")));
});

def("thuatngu", ["tn", "terms", "thuat-ngu"], "AI & dữ liệu", "[từ khoá]", "Các khái niệm trong ontology, đồng nghĩa và trạng thái xác nhận", (a, out) => {
  need(); const q = a.join(" "); const list = q ? searchTerms(q, 20) : D.ont.terms;
  out.append(table([{ l: "Khái niệm", f: (t) => link("dinhnghia " + t.ten, t.ten) }, { l: "Bảng", k: "dataset" }, { l: "Đồng nghĩa", f: (t) => t.dong_nghia.slice(0, 4).join(", "), wrap: 1 }, { l: "Trạng thái", f: (t) => el("span", { class: t.status === "xac_nhan" ? "ok" : t.status === "doi_chieu" ? "fg2" : "warn" }, D.ont.status_label[t.status]) }], list));
  out.append(el("p", { class: "muted" }, `Ontology phiên bản ${D.ont.version}: ${D.ont.terms.length} khái niệm, ${D.ont.metrics.length} chỉ số, ${D.ont.datasets.length} bảng, ${D.ont.relationships.length} quan hệ. Xuất chuẩn Apache Ossie để nhập vào NVIDIA Auto Ontology.`));
});

def("dinhnghia", ["dn", "dinh-nghia", "define"], "AI & dữ liệu", "<khái niệm>", "Nghĩa, ánh xạ cột, quan hệ, công thức SQL, nguồn gốc, xác nhận của một khái niệm", (a, out) => {
  need(); const q = a.join(" "); const t = searchTerms(q, 1)[0]; if (!t) throw new Error(`Không thấy khái niệm "${q}". Gõ thuatngu để xem danh sách.`);
  const d = termDetail(t);
  out.append(el("div", { class: "ans" },
    el("div", { class: "row" }, el("div", { class: "lab" }, "Nghĩa"), el("div", {}, el("b", { class: "k" }, t.ten), el("p", {}, t.mo_ta), el("p", { class: "muted" }, "Đồng nghĩa: " + t.dong_nghia.join(", ")))),
    el("div", { class: "row" }, el("div", { class: "lab" }, "Nằm ở"), el("div", {}, el("p", {}, el("span", { class: "tag" }, d.dataset.name), d.dataset.label, ` · ${d.dataset.grain}`), t.cot ? el("p", { class: "fg2" }, "Cột: " + t.cot.join(", ") + (t.loc ? ` · lọc ${t.loc}` : "")) : null)),
    d.relationships.length ? el("div", { class: "row" }, el("div", { class: "lab" }, "Nối với"), el("div", {}, d.relationships.map((r) => el("p", { class: "fg2" }, `${r.from}.${r.from_columns} → ${r.to}.${r.to_columns} (${r.cardinality}). ${r.note}`)))) : null,
    d.metric ? el("div", { class: "row" }, el("div", { class: "lab" }, "Tính thế nào"), el("div", {}, el("p", {}, d.metric.label, ` (${d.metric.unit}, theo ${d.metric.grain})`), el("pre", {}, d.metric.sql), el("div", { class: "acts", style: "margin-top:8px" }, el("button", { class: "btn", type: "button", onclick: () => exec("sql " + d.metric.sql.replace(/\n/g, " ")) }, "Chạy SQL này")))) : null,
    el("div", { class: "row" }, el("div", { class: "lab" }, "Từ đâu ra"), el("div", {}, el("p", {}, el("a", { href: d.dataset.lineage.url, target: "_blank", rel: "noopener" }, d.dataset.lineage.nguon)), el("p", { class: "muted" }, `Tệp: ${d.dataset.lineage.tep} · bộ cào: `, el("a", { href: d.dataset.lineage.bo_cao, target: "_blank", rel: "noopener" }, "mã nguồn")))),
    el("div", { class: "row" }, el("div", { class: "lab" }, "Dùng được?"), el("div", {}, el("p", { class: t.status === "xac_nhan" ? "ok" : t.status === "doi_chieu" ? "fg2" : "warn" }, D.ont.status_label[t.status]), el("p", { class: "muted" }, "Muốn xác nhận: sửa status trong ontology/build_ontology.py, chạy lại và commit.")))));
});

def("sql", ["query"], "AI & dữ liệu", "<SELECT …>", "Chạy SQL trên DuckDB ngay trong trình duyệt (bảng: gõ bang)", async (a, out) => {
  const q = a.join(" "); if (!q) throw new Error("Cú pháp: sql SELECT … Xem bảng: bang");
  const st = el("p", { class: "spin muted" }, "Đang chạy…"); out.append(st);
  try { const t0 = performance.now(); const r = await runSQL(q, { onStatus: (s) => (st.textContent = s) }); st.remove(); out.append(sqlTable(r)); out.append(el("p", { class: "muted" }, `${N(r.row_count)} dòng${r.truncated ? " (hiện 200 dòng đầu)" : ""} · ${N(performance.now() - t0, 0)} ms`)); }
  catch (e) { st.remove(); throw e; }
});

def("bang", ["tables", "schema", "describe"], "AI & dữ liệu", "[tên bảng]", "Danh sách bảng hoặc cấu trúc một bảng", (a, out) => {
  need(); const n = a[0]; const ds = n ? D.ont.datasets.find((d) => d.name === n || fold(d.label).includes(fold(n))) : null;
  if (!ds) { out.append(table([{ l: "Bảng", f: (d) => link("bang " + d.name, d.name) }, { l: "Nội dung", k: "label", wrap: 1 }, { l: "Độ hạt", k: "grain" }, { l: "Số dòng", n: 1, f: (d) => N(D.t[d.name]?.length) }], D.ont.datasets)); return; }
  out.append(P(el("b", { class: "k" }, ds.label), " – ", ds.description));
  out.append(table([{ l: "Cột", k: "name" }, { l: "Kiểu", k: "type" }, { l: "Ý nghĩa", k: "mo_ta", wrap: 1 }], ds.fields));
  out.append(next(`sql SELECT * FROM ${ds.name} ORDER BY 1 DESC LIMIT 20`, `xuat ${ds.name}`));
});

def("xuat", ["export", "csv"], "AI & dữ liệu", "<tên bảng>", "Tải một bảng về CSV (mở bằng Excel)", (a, out) => {
  need(); const ds = D.ont.datasets.find((d) => d.name === a[0]); if (!ds) throw new Error("Cú pháp: xuat <tên bảng>. Gõ bang để xem tên.");
  const rows = D.t[ds.name], cols = ds.fields.map((f) => f.name);
  const csv = "\ufeff" + [cols.join(","), ...rows.map((r) => cols.map((c) => { const v = r[c]; return v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(","))].join("\n");
  download(`${ds.name}-${todayVN()}.csv`, csv, "text/csv"); out.append(P(`Đã tải ${N(rows.length)} dòng của bảng ${ds.name}. Muốn Excel tự cập nhật: gõ `, link("api " + ds.name), "."));
});

def("api", ["endpoint", "powerbi", "excel"], "AI & dữ liệu", "[tên bảng]", "API trên máy này: nối Excel, Power BI để số tự cập nhật", (a, out) => {
  const o = location.origin, ten = D.ont?.datasets.some((d) => d.name === a[0]) ? a[0] : "ty_gia_trung_tam";
  const row = (k, path, v) => ({ k, url: o + path, v });
  const rows = [
    row("Danh mục API", "/api/v1", "Mô tả mọi điểm truy cập"),
    row("Tổng quan", "/api/v1/tong-quan", "Chỉ số chính, tín hiệu rủi ro (JSON)"),
    row("Danh sách bảng", "/api/v1/bang", "Tên bảng, cột, số dòng, ngày mới nhất"),
    row(`Bảng ${ten} (CSV)`, `/api/v1/bang/${ten}?dinh_dang=csv`, "Mở thẳng bằng Excel, Power BI"),
    row(`Bảng ${ten} 1 năm (JSON)`, `/api/v1/bang/${ten}?tu=${new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)}`, "Lọc theo ngày: tu=, den="),
    row("Sức khoẻ nguồn", "/api/v1/suc-khoe", "Lần cào cuối, trạng thái từng nguồn"),
    row("Ontology", "/api/v1/ontology", "Khái niệm, chỉ số, công thức SQL"),
  ];
  out.append(table([{ l: "Mục", k: "k" }, { l: "Địa chỉ", f: (r) => el("a", { href: r.url, target: "_blank", rel: "noopener" }, r.url.replace(o, "")), wrap: 1 }, { l: "Dùng để", k: "v", wrap: 1 }, { l: "", f: (r) => el("button", { class: "btn sm", type: "button", onclick: (e) => copy(r.url, e.currentTarget) }, "Chép") }], rows));
  out.append(H("Nối vào Excel (tự cập nhật)"));
  out.append(el("ol", { class: "steps" },
    el("li", {}, "Excel → Data → From Web (Từ web)."),
    el("li", {}, "Dán địa chỉ CSV ở trên, ví dụ ", el("code", {}, `${o}/api/v1/bang/${ten}?dinh_dang=csv`), "."),
    el("li", {}, "Load. Sau đó Data → Refresh All (hoặc Query Properties → Refresh every 60 minutes)."),
  ));
  out.append(el("p", { class: "muted" }, "Power BI Desktop: Get data → Web, cùng địa chỉ. API chạy ngay trên máy này (", el("code", {}, o), "), chỉ đọc, không cần khoá; Excel/Power BI chỉ làm mới được khi CFO Terminal đang mở."));
});

def("nguon", ["suckhoe", "health", "nguon-du-lieu"], "Hệ thống", "", "Tình trạng từng nguồn, độ trễ, lần cào gần nhất", (a, out) => {
  need(); const h = D.raw.health || { sources: {} };
  const per = (x) => !x ? "—" : x.length === 7 ? MY(x + "-01") : DMY(x);
  out.append(P(el("span", { class: "muted" }, "Bộ cào chạy lần cuối "), h.lan_chay ? new Date(h.lan_chay).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—", el("span", { class: "muted" }, ` trên ${h.may_chay === "may-tinh-cfo" ? "máy này" : h.may_chay === "github-actions" ? "GitHub Actions (số đóng gói sẵn)" : h.may_chay || "—"}; trang này nạp số liệu lúc ${D.loadedAt?.toLocaleTimeString("vi-VN")}.`)));
  out.append(table([{ l: "Nguồn", f: (s) => el("a", { href: s.link, target: "_blank", rel: "noopener" }, s.ten) }, { l: "Có từ", f: (s) => per(s.ky_dau_tien) }, { l: "Mới nhất", f: (s) => per(s.ky_moi_nhat) }, { l: "Bản ghi", n: 1, f: (s) => N(s.so_ban_ghi) }, { l: "Trạng thái", f: (s) => el("span", { class: s.trang_thai === "ok" ? "ok" : s.trang_thai === "cho" ? "warn" : "bad" }, s.trang_thai === "ok" ? "● Ổn" : s.trang_thai === "cho" ? "● Chờ lượt sau" : "● Lỗi") }, { l: "Lịch sử", f: (s) => s.lich_su_day_du === false ? "đang tải dần" : s.lich_su_day_du ? "đủ" : "—" }], Object.values(h.sources || {})));
  out.append(el("p", { class: "muted" }, "App tự cào ngay trên máy này khi mở và mỗi giờ sau đó; NHNN chặn khi gọi dồn dập nên mỗi lượt chỉ gọi tối đa 4 lần, giãn cách 20 giây. Nếu NHNN chặn máy này, app lấy bù từ kho công khai vcb-exchange-rate. Gõ capnhat để cập nhật ngay, api để nối Excel."));
});

def("capnhat", ["cn", "cap-nhat", "update", "cao"], "Hệ thống", "[ngay]", "Cào số liệu mới ngay bây giờ (NHNN và giá USD ngân hàng) trên máy này", async (a, out) => {
  const st = el("p", { class: "spin muted" }, "Đang cập nhật: NHNN giãn cách 20 giây mỗi lần gọi nên có thể mất 1–2 phút…"), logBox = el("pre", { class: "code" });
  out.append(st, logBox);
  let j = await api("/api/capnhat", { force: fold(a[0] || "") === "ngay" });
  while (j.running) { logBox.textContent = (j.log || []).slice(-12).join("\n"); await new Promise((r) => setTimeout(r, 1500)); j = await api("/api/capnhat"); }
  st.remove(); logBox.textContent = (j.log || []).slice(-12).join("\n") || "Không có gì mới.";
  if (j.lastError) out.append(el("p", { class: "err" }, "Lỗi: " + j.lastError));
  await loadAll(); paintStatus();
  const r = j.result?.nhnn?.results || {};
  out.append(P(`Xong lúc ${new Date().toLocaleTimeString("vi-VN")}: `, Object.entries(r).map(([k, v]) => `${k} ${v === "ok" ? "ổn" : v === "cho" ? "chờ lượt sau" : "lỗi"}`).join(", ") || "đã dùng số đang có", `. Giá ngân hàng: ${j.result?.banks?.direct?.join(", ") || "không cào thẳng được"}.`));
  out.append(next("tongquan", "nguon"));
});

def("ai", ["ketnoi", "ket-noi", "cai-dat-ai", "ai-setup"], "Hệ thống", "", "Kết nối AI trên máy này: Claude Code, ChatGPT/Codex, Gemini, Ollama hoặc khoá API", async (a, out) => {
  const st = el("p", { class: "spin muted" }, "Đang dò các nền tảng AI trên máy…"); out.append(st);
  await ai.refresh(true); st.remove();
  const cfg = ai.cfg, cats = { cli: "Đăng nhập bằng tài khoản (không cần khoá)", api: "Khoá API (trả theo lượt dùng)", local: "Chạy offline trên máy" };
  const pill = (e) => el("span", { class: "pill " + (e.installed && e.loggedIn ? "ok" : e.installed ? "warn" : "bad") }, e.installed && e.loggedIn ? "sẵn sàng" : e.installed ? "chưa đăng nhập" : "chưa cài");
  const jobBox = el("div", { class: "job", hidden: true });
  const follow = async (job) => {
    if (job.mode === "windows-console" || job.launched) { jobBox.hidden = false; jobBox.replaceChildren(P("Đã mở cửa sổ dòng lệnh. Làm theo hướng dẫn trong cửa sổ đó (đăng nhập trên trình duyệt), xong quay lại bấm ", el("b", {}, "Dò lại"), ".")); return; }
    jobBox.hidden = false;
    const pre = el("pre", { class: "code" }), links = el("div", { class: "acts" }), inp = el("form", { class: "acts", hidden: true }, el("input", { name: "t", placeholder: "Dán mã xác nhận vào đây", class: "txt" }), el("button", { class: "btn sm", type: "submit" }, "Gửi"));
    inp.onsubmit = async (e) => { e.preventDefault(); await api(`/api/jobs/${job.id}/input`, { text: inp.t.value }); inp.t.value = ""; };
    jobBox.replaceChildren(pre, links, inp);
    for (;;) {
      const j = await api(`/api/jobs/${job.id}`);
      pre.textContent = (j.output || "").slice(-3000) || "Đang chạy…";
      links.replaceChildren(...(j.urls || []).slice(-3).map((u) => el("a", { href: u, target: "_blank", rel: "noopener", class: "btn sm" }, "Mở trang đăng nhập")));
      inp.hidden = !j.needsInput;
      if (j.status !== "running") { pre.textContent += `\n— ${j.status === "done" ? "Xong" : "Kết thúc: " + j.status}`; break; }
      await new Promise((r) => setTimeout(r, 1200));
    }
    await ai.refresh(true); paint();
  };
  const box = el("div");
  const paint = () => {
    box.replaceChildren();
    const cur = ai.engine();
    box.append(el("p", { class: "lead" }, cur && ai.ready() ? ["Đang dùng ", el("b", {}, cur.name), cfg.model ? ` (mô hình ${cfg.model})` : "", ". Gõ ", link("hoi lãi suất qua đêm tuần này so với OMO?"), " để thử."] : "Chọn một nền tảng AI đã có trên máy. App gọi AI ngay trên máy anh, không qua máy chủ nào, không cần khoá của người khác."));
    for (const [c, title] of Object.entries(cats)) {
      const ORDER = ["claude", "codex", "gemini", "anthropic-api", "gemini-api", "openrouter", "ollama"];
      const rank = (e) => { const i = ORDER.indexOf(e.id); return i < 0 ? 99 : i; };
      const list = ai.engines.filter((e) => e.category === c).sort((x, y) => rank(x) - rank(y));
      if (!list.length) continue;
      box.append(H(title));
      box.append(el("div", { class: "engs" }, list.map((e) => el("label", { class: "eng" + (cfg.engine === e.id ? " sel" : "") },
        el("input", { type: "radio", name: "eng", value: e.id, checked: cfg.engine === e.id ? "" : null }),
        el("div", { class: "nm" }, el("b", {}, e.name, " ", pill(e)), el("span", { class: "muted" }, e.vendor, " · ", e.detail),
          e.envKeyName ? el("input", { type: "password", class: "txt", "data-key": e.envKeyName, placeholder: (e.envKeyLabel || e.envKeyName) + (cfg.apiKeys?.[e.envKeyName] ? " — đã lưu " + cfg.apiKeys[e.envKeyName] : ""), autocomplete: "off" }) : null),
        el("div", { class: "acts" },
          e.installCmd && !e.installed ? el("button", { class: "btn sm", type: "button", onclick: async () => follow(await api("/api/engines/install", { id: e.id })) }, "Cài") : null,
          e.loginCmd && e.installed && !e.loggedIn ? el("button", { class: "btn sm", type: "button", onclick: async () => follow(await api("/api/engines/login", { id: e.id, mode: "terminal" })) }, "Đăng nhập") : null,
          el("button", { class: "btn sm", type: "button", onclick: async (ev) => { const b = ev.currentTarget; b.textContent = "Đang thử…"; try { await save(); const r = await api("/api/engines/ping", { id: e.id, model: e.id === cfg.engine ? cfg.model : "" }); b.textContent = `Trả lời sau ${(r.latencyMs / 1000).toFixed(1)} giây`; } catch (err) { b.textContent = "Lỗi: " + String(err.message).slice(0, 60); } } }, "Thử"))))));
    }
    const models = (ai.engines.find((e) => e.id === cfg.engine)?.models || []);
    box.append(H("Mô hình và dự phòng"));
    box.append(el("div", { class: "acts" },
      el("input", { id: "ai-model", class: "txt", list: "ai-models", value: cfg.model || "", placeholder: "Mô hình (để trống = mặc định của nền tảng)" }),
      el("datalist", { id: "ai-models" }, models.map((m) => el("option", { value: m }))),
      el("select", { id: "ai-fb", class: "txt", "aria-label": "Nền tảng dự phòng" }, el("option", { value: "" }, "Không dùng dự phòng"), ai.engines.filter((e) => e.installed && e.loggedIn && e.id !== cfg.engine).map((e) => el("option", { value: e.id, selected: (cfg.fallback || [])[0] === e.id ? "" : null }, "Dự phòng: " + e.name)))));
    box.append(el("div", { class: "acts" }, el("button", { class: "btn pri", type: "button", onclick: async (ev) => { await save(); ev.currentTarget.textContent = "Đã lưu"; paint(); } }, "Lưu"), el("button", { class: "btn", type: "button", onclick: async () => { await ai.refresh(true); paint(); } }, "Dò lại")));
    box.append(jobBox);
    box.append(el("p", { class: "muted" }, "Khoá API chỉ lưu trong ", el("code", {}, cfg.dataDir || "%APPDATA%\\CFO Terminal"), " trên máy này. Claude Code cần gói Claude Pro/Max; Codex cần ChatGPT Plus/Pro; Gemini CLI đăng nhập bằng tài khoản Google; Ollama chạy offline."));
  };
  const save = async () => {
    const eng = box.querySelector("input[name=eng]:checked")?.value || "";
    const keys = {}; box.querySelectorAll("input[data-key]").forEach((i) => { if (i.value.trim()) keys[i.dataset.key] = i.value.trim(); });
    const fb = box.querySelector("#ai-fb")?.value;
    ai.cfg = await api("/api/config", { engine: eng, model: box.querySelector("#ai-model")?.value || "", fallback: fb ? [fb] : [], apiKeys: keys });
    await ai.refresh(Object.keys(keys).length > 0 || eng !== cfg.engine);
    Object.assign(cfg, ai.cfg);
  };
  box.addEventListener("change", async (e) => { if (e.target.name === "eng") { await save(); paint(); } });
  paint(); out.append(box);
});

def("giaodien", ["theme", "giao-dien", "sang", "toi"], "Hệ thống", "", "Đổi giao diện sáng/tối", (a, out) => { toggleTheme(); out.append(P(`Giao diện ${document.documentElement.dataset.theme === "light" ? "sáng" : "tối"}.`)); });
def("lichsu", ["history"], "Hệ thống", "", "Các lệnh đã gõ", (a, out) => { const h = store.get("history", []); out.append(h.length ? el("ol", {}, h.slice(-20).reverse().map((c) => el("li", {}, link(c)))) : P("Chưa có lệnh nào.")); });
def("lammoi", ["reload", "refresh", "lam-moi"], "Hệ thống", "", "Nạp lại số liệu mới nhất", async (a, out) => { await loadAll(); paintStatus(); out.append(P("Đã nạp lại lúc ", D.loadedAt.toLocaleTimeString("vi-VN"), ".")); });
def("xoa", ["clear", "cls"], "Hệ thống", "", "Xoá màn hình (Ctrl+L)", () => { $("#log").replaceChildren(); return "silent"; });

const INDEX = new Map(); for (const c of COMMANDS) [c.name, ...c.aliases].forEach((k) => INDEX.set(fold(k), c));
function route(q) {
  const f = fold(q);
  const R = [[/bien do|ap luc|tran|san ty gia|du dia/, "biendo"], [/ngan hang|vietcombank|bidv|techcombank|ban usd|mua usd|gia usd/, "nganhang"], [/ty gia|usd|do la|dola|tgtt/, "tygia"],
    [/qua dem|lien ngan hang|lai suat|ky han|duong cong|tai cap von/, "laisuat"], [/thanh khoan|doanh so|thieu von/, "thanhkhoan"], [/omo|thi truong mo|bom|hut/, "omo"], [/cpi|lam phat|gia ca/, "cpi"],
    [/tac dong|anh huong|lo ty gia|lai ty gia|danh gia lai|kich ban/, "tacdong"], [/bao cao|tom tat|ban tin|memo/, "baocao"], [/canh bao|rui ro|tin hieu/, "canhbao"], [/cau hoi|ban dieu hanh/, "cauhoi"]];
  for (const [re, c] of R) if (re.test(f)) return c;
  return "tongquan";
}

// ================================================================ khung terminal
const logEl = $("#log"), input = $("#cmd"), sug = $("#suggest");
function entry(text) {
  const out = el("div", { class: "out" });
  const e = el("section", { class: "entry" }, el("div", { class: "cmdline" }, el("span", { class: "p", "aria-hidden": "true" }, "cfo ›"), el("span", {}, text), el("span", { class: "t" }, new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }))), out);
  logEl.append(e);
  return { e, out };
}
async function exec(raw, { record = true } = {}) {
  const text = raw.trim(); if (!text) return;
  if (record) { const h = store.get("history", []).filter((x) => x !== text); h.push(text); store.set("history", h.slice(-100)); hist.i = null; }
  const [head, ...rest] = text.split(/\s+/);
  let cmd = INDEX.get(fold(head)), args = rest;
  if (!cmd) { cmd = INDEX.get("hoi"); args = text.split(/\s+/); }
  const { e, out } = entry(text);
  e.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  try {
    if (!D.ready && cmd.name !== "trogiup" && cmd.name !== "ai" && cmd.name !== "giaodien" && cmd.name !== "xoa" && cmd.name !== "lichsu") { out.append(el("p", { class: "spin muted" }, "Đang chờ số liệu…")); await dataReady; out.replaceChildren(); }
    const r = await cmd.run(args, out);
    if (r === "silent") e.remove();
  } catch (err) {
    out.append(el("p", { class: "err" }, "Lỗi: " + (err.message || err)));
  }
  history.replaceState(null, "", "#lenh=" + encodeURIComponent(text));
}

// gợi ý & lịch sử
const hist = { i: null };
let sel = -1, opts = [];
function renderSuggest() {
  const v = input.value; const first = fold(v.split(/\s+/)[0] || "");
  if (!v || /\s/.test(v.trim()) && INDEX.has(first)) { sug.dataset.open = "0"; opts = []; return; }
  const q = fold(v.trim());
  opts = COMMANDS.filter((c) => [c.name, ...c.aliases].some((k) => fold(k).startsWith(q)) || fold(c.desc).includes(q)).slice(0, 8);
  sel = opts.length ? 0 : -1;
  sug.replaceChildren(...opts.map((c, i) => el("div", { class: "opt", role: "option", "aria-selected": i === sel ? "true" : "false", onmousedown: (e) => { e.preventDefault(); pick(i); } }, el("b", {}, c.name + (c.args ? " " + c.args : "")), el("span", {}, c.desc))));
  sug.dataset.open = opts.length ? "1" : "0";
}
function pick(i) { const c = opts[i]; if (!c) return; input.value = c.name + (c.args ? " " : ""); sug.dataset.open = "0"; input.focus(); if (!c.args || /^\[/.test(c.args)) { /* chạy ngay nếu không bắt buộc tham số */ } }
function moveSel(d) { if (!opts.length) return; sel = (sel + d + opts.length) % opts.length; [...sug.children].forEach((x, i) => x.setAttribute("aria-selected", i === sel ? "true" : "false")); sug.children[sel]?.scrollIntoView({ block: "nearest" }); }
input.addEventListener("input", renderSuggest);
input.addEventListener("keydown", (e) => {
  const open = sug.dataset.open === "1";
  if (e.key === "Tab") { e.preventDefault(); if (open) pick(sel); else renderSuggest(); return; }
  if (e.key === "Escape") { sug.dataset.open = "0"; return; }
  if (e.key === "ArrowDown") { e.preventDefault(); if (open) return moveSel(1); const h = store.get("history", []); if (hist.i == null) return; hist.i = Math.min(h.length, hist.i + 1); input.value = h[hist.i] || ""; return; }
  if (e.key === "ArrowUp") { e.preventDefault(); if (open) return moveSel(-1); const h = store.get("history", []); if (!h.length) return; hist.i = hist.i == null ? h.length - 1 : Math.max(0, hist.i - 1); input.value = h[hist.i]; return; }
  if (e.key === "l" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); logEl.replaceChildren(); }
});
$("#form").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; sug.dataset.open = "0"; exec(v); });
document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); } });

// chip lệnh nhanh
const CHIPS = [["Tổng quan", "tongquan"], ["Áp lực tỷ giá", "biendo"], ["Giá USD ngân hàng", "nganhang"], ["Lãi suất", "laisuat"], ["Thanh khoản", "thanhkhoan"], ["OMO", "omo"], ["Lạm phát", "cpi"], ["Tác động DN", "tacdong"], ["Cảnh báo", "canhbao"], ["Báo cáo CFO", "baocao"], ["Hỏi AI…", "hoi "], ["Kết nối AI", "ai"], ["Cập nhật số", "capnhat"], ["Nối Excel", "api"], ["Trợ giúp", "trogiup"]];
$("#chips").replaceChildren(...CHIPS.map(([l, c]) => el("button", { class: "chip", type: "button", onclick: () => { if (c.endsWith(" ")) { input.value = c; input.focus(); } else exec(c); } }, l)));

// thanh trạng thái
function toggleTheme() { const r = document.documentElement; r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light"; store.set("theme", r.dataset.theme); localStorage.setItem("cfo:theme", r.dataset.theme); redraws.forEach((f) => f()); }
$("#st-theme").onclick = toggleTheme;
$("#st-data").onclick = () => exec("nguon");
$("#st-ai").onclick = () => exec("ai");
function paintStatus() {
  const d = $("#st-data"), a = $("#st-ai");
  if (D.err) { d.replaceChildren(el("span", { class: "dot bad" }), el("span", {}, "Không nạp được số liệu")); }
  else if (D.ready) {
    const src = Object.values(D.raw.health?.sources || {}), ok = src.filter((s) => s.trang_thai === "ok").length;
    d.replaceChildren(el("span", { class: "dot " + (ok === src.length ? "ok" : "warn") }), el("span", { class: "lbl-short" }, `${ok}/${src.length}`), el("span", { class: "lbl-long" }, `${ok}/${src.length} nguồn · TT ${DMY(M.last?.ngay).slice(0, 5)}`));
  }
  a.replaceChildren(el("span", { class: "dot " + (!ai.configured() ? "" : !ai.loaded ? "" : ai.ready() ? "ok" : "warn") }), el("span", { class: "lbl-short" }, "AI"), el("span", { class: "lbl-long" }, ai.label()));
}

// khởi động
let resolveReady; const dataReady = new Promise((r) => (resolveReady = r));
(async function boot() {
  paintStatus();
  ai.refresh(false).then(() => ai.refresh(true));
  const { out } = entry("chào");
  out.append(el("p", { class: "lead" }, "CFO Terminal tự cào số liệu Ngân hàng Nhà nước và giá USD ngân hàng ngay trên máy này (khi mở app và mỗi giờ), tính sẵn chỉ số cho CFO. Hỏi AI bằng tiếng Việt qua tài khoản Claude, ChatGPT, Gemini hoặc Ollama của chính anh; mọi câu trả lời kèm SQL, các bước và nguồn để tự kiểm."));
  out.append(el("p", { class: "muted" }, "Bấm chip bên dưới hoặc gõ ", link("trogiup"), ". Phím ", el("kbd", {}, "/"), " để nhảy vào ô lệnh."));
  try { await loadAll(); resolveReady(); }
  catch (e) { D.err = e; out.append(el("p", { class: "err" }, "Không nạp được số liệu: " + e.message)); }
  paintStatus();
  const h = decodeURIComponent((location.hash.match(/lenh=([^&]+)/) || [])[1] || "");
  await exec(h || "tongquan", { record: false });
  input.focus({ preventScroll: true });
  setInterval(async () => { try { await loadAll(); paintStatus(); } catch {} }, 10 * 60 * 1000);
})();
