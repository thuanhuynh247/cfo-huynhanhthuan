// crawler.mjs — Bộ cào chạy ngay trên máy CFO (bản Node của crawler/sbv.py và crawler/ngan_hang.py).
// Mỗi máy tự gọi sbv.gov.vn bằng IP của chính mình, giãn cách 20 giây, tối đa 4 lần gọi mỗi lượt
// (NHNN chặn khi gọi dồn dập). Nguồn dự phòng: kho công khai thuanhuynh247/vcb-exchange-rate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, getConfig } from "./store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SEED_DIR = path.join(ROOT, "data");
export const USER_DATA = process.env.CFO_USER_DATA || path.join(DATA_DIR, "data");

const BASE = "https://sbv.gov.vn";
const API = (sid) => `${BASE}/o/headless-delivery/v1.0/content-structures/${sid}/structured-contents`;
export const STRUCTURES = { central: 137473, reference: 3450514, interbank: 3450260, policy: 3450482 };
const PAGES = { omo: BASE + "/vi/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F", cpi: BASE + "/vi/cpi" };
const LINKS = { central: BASE + "/bieu-do-ty-gia-trung-tam", reference: BASE + "/vi/t%E1%BB%B7-gi%C3%A1", interbank: BASE + "/l%C3%A3i-su%E1%BA%A5t1", policy: BASE + "/l%C3%A3i-su%E1%BA%A5t1", omo: PAGES.omo, cpi: PAGES.cpi };
const TITLES = { central: "Tỷ giá trung tâm VND/USD", reference: "Tỷ giá tham khảo tại Cục QLNH", interbank: "Lãi suất & doanh số liên ngân hàng", policy: "Lãi suất NHNN quy định", omo: "Kết quả đấu thầu thị trường mở (OMO)", cpi: "CPI (tin NHNN đăng lại từ Cục Thống kê)" };
const MIRROR = "https://raw.githubusercontent.com/thuanhuynh247/vcb-exchange-rate/main/docs/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PACE_MS = +(process.env.CFO_PACE_MS || 20000);
const MAX_CALLS = +(process.env.CFO_MAX_CALLS || 4);

// Electron truyền net.fetch (theo proxy của Windows); chạy ngoài Electron thì dùng fetch của Node
let doFetch = (...a) => fetch(...a);
export function setFetch(fn) { if (typeof fn === "function") doFetch = fn; }

// ------------------------------------------------------------------ tiện ích
export function vnNum(s) {
  if (s == null) return null;
  s = String(s).trim().replace(/%/g, "").replace(/ /g, "").replace(/ /g, "");
  if (!s || s === "-" || s === "–") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (s.startsWith(".")) s = "0" + s;
  const v = Number(s);
  return s !== "" && isFinite(v) ? v : null;
}
// '2026-11-25T17:00:00Z' -> '2026-11-26' (ngày theo giờ Việt Nam)
export function isoToVnDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return isFinite(t) ? new Date(t + 7 * 3600e3).toISOString().slice(0, 10) : null;
}
const nowVN = () => new Date(Date.now() + 7 * 3600e3);
const vnIso = () => nowVN().toISOString().slice(0, 19) + "+07:00";
const todayVN = () => nowVN().toISOString().slice(0, 10);
const decode = (s) => String(s).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const textOf = (h) => decode(String(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function fields(item) {
  const flat = {}, groups = {};
  for (const f of item.contentFields || []) {
    const nested = f.nestedContentFields || [];
    if (nested.length) (groups[f.name] ||= []).push(Object.fromEntries(nested.map((n) => [n.name, n.contentFieldValue?.data ?? null])));
    else flat[f.name] = f.contentFieldValue?.data ?? null;
  }
  return [flat, groups];
}

// ------------------------------------------------------------------ đọc API
export function parseCentral(items) {
  const rows = {};
  for (const it of items) {
    const [f] = fields(it);
    const d = isoToVnDate(f.NgayBatDau) || isoToVnDate(it.datePublished), v = vnNum(f.TyGiaSo);
    if (d && v) rows[d] = { d, v, vb: f.SoVanBan || "", pub: it.datePublished };
  }
  return rows;
}
export function parseReference(items) {
  const rows = {};
  for (const it of items) {
    const [f, g] = fields(it);
    const d = isoToVnDate(f.ngayApDung) || isoToVnDate(it.datePublished), cur = {};
    for (const x of g.tyGiaThamKhaos || []) { const code = String(x.ngoaiTe || "").split("-")[0].trim(); if (code) cur[code] = [vnNum(x.mua), vnNum(x.ban)]; }
    if (d && Object.keys(cur).length) rows[d] = { d, fx: cur, pub: it.datePublished };
  }
  return rows;
}
const TENORS = { "qua đêm": "ON", "1 tuần": "1W", "2 tuần": "2W", "1 tháng": "1M", "3 tháng": "3M", "6 tháng": "6M", "9 tháng": "9M", "12 tháng": "12M" };
export function parseInterbank(items) {
  const rows = {};
  for (const it of items) {
    const [f, g] = fields(it);
    const d = isoToVnDate(f.ngayApDung);
    if (!d) continue;
    const r = {}, vol = {}, note = {};
    for (const x of g.laiSuatThiTruongNganHangs || []) {
      const key = TENORS[String(x.thoihan || "").trim().toLowerCase()];
      if (!key) continue;
      r[key] = vnNum(x.laiSuatBQLienNganHang); vol[key] = vnNum(x.doanhSo);
      if (String(x.footNode || "").trim()) note[key] = String(x.noiDungFootNode || "").trim();
    }
    if (!Object.keys(r).length) continue;
    const row = { d, r, vol, pub: it.datePublished };
    if (Object.keys(note).length) row.note = note;
    if (!rows[d] || (row.pub || "") > (rows[d].pub || "")) rows[d] = row; // trùng ngày: giữ bản đăng sau cùng
  }
  return rows;
}
export function parsePolicy(items) {
  const out = [];
  for (const it of items) {
    const [f, g] = fields(it);
    for (const x of g.banglaiSuats || []) out.push({ loai: String(x.loaiLaiSuat || "").trim(), gia_tri: vnNum(x.giaTri), van_ban: String(x.vanBanQuyetDinh || "").trim(), ap_dung: isoToVnDate(f.ngayApDung) });
  }
  return out;
}

// ------------------------------------------------------------------ đọc HTML
export function parseOmo(html) {
  const m = /class="ls01-date"[^>]*>\s*Ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/.exec(html);
  if (!m) throw new Error("Không thấy ngày đấu thầu OMO");
  const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const tm = /<table[^>]*class="[^"]*ls01-table[^"]*"[^>]*>([\s\S]*?)<\/table>/.exec(html);
  if (!tm) throw new Error("Không thấy bảng OMO");
  const sessions = []; let cur = null;
  for (const tr of tm[1].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)) {
    const cls = (/class="([^"]*)"/.exec(tr[1]) || [])[1] || "";
    const cells = [...tr[2].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => textOf(c[1]));
    if (cls.includes("ls01-group")) { cur = { loai: cells[0], ky_han: [], tong: null }; sessions.push(cur); }
    else if (cls.includes("ls01-total") && cur) cur.tong = vnNum(cells.slice(1).find((c) => c) ?? null);
    else if (cur && cells.length >= 4 && cells[0].includes("Kỳ hạn")) {
      const days = /(\d+)/.exec(cells[0]); const [tv, tt] = [...cells[1].split("/"), ""];
      cur.ky_han.push({ ngay: days ? +days[1] : null, tham_gia: vnNum(tv), trung_thau: vnNum(tt), kl: vnNum(cells[2]) || 0, ls: vnNum(cells[3]) });
    }
  }
  if (!sessions.length) throw new Error("Bảng OMO rỗng");
  sessions.forEach((s, i) => (s.phien = i + 1));
  return { d, phien: sessions, tong: Math.round(sessions.reduce((a, s) => a + (s.tong || 0), 0) * 100) / 100 };
}
export function parseCpi(html) {
  const re = /class="news-title">\s*(CPI tháng (\d{1,2})\/(\d{4})[^<]*)<\/a>[\s\S]*?class="top-news-detail">([\s\S]*?)<\/span>[\s\S]*?class="news-date">\s*\(([\d/]+)\)/g;
  const out = {};
  for (const m of html.matchAll(re)) {
    const body = textOf(m[4]), key = `${m[3]}-${m[2].padStart(2, "0")}`;
    const sgn = (g) => (g ? vnNum(g[2]) * (g[1] === "giảm" ? -1 : 1) : null);
    out[key] = {
      thang: key,
      mom: sgn(/(tăng|giảm)\s*([\d,]+)%\s*so với tháng trước/.exec(body)),
      yoy: sgn(/(tăng|giảm)\s*([\d,]+)%\s*so với cùng kỳ năm trước/.exec(body)),
      bq: sgn(/[Bb]ình quân \S+ tháng[^;.]{0,40}?CPI (tăng|giảm)\s*([\d,]+)%/.exec(body)),
      co_ban_bq: sgn(/lạm phát cơ bản (tăng|giảm)\s*([\d,]+)%/.exec(body)),
      tieu_de: m[1].trim(), dang_ngay: m[5], tom_tat: body.slice(0, 600),
    };
  }
  if (!Object.keys(out).length) throw new Error("Không đọc được tin CPI nào");
  return out;
}

// ------------------------------------------------------------------ lưu trữ
const file = (rel) => path.join(USER_DATA, rel);
export function readJson(rel, def) { try { return JSON.parse(fs.readFileSync(file(rel), "utf8")); } catch { return def; } }
export function writeJson(rel, obj) {
  const f = file(rel); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + ".tmp", JSON.stringify(obj)); fs.renameSync(f + ".tmp", f);
}
const byDate = (list, key = "d") => Object.fromEntries((list || []).map((r) => [r[key], r]));
export function mergeRows(oldList, newMap, key = "d") {
  const m = { ...byDate(oldList, key), ...newMap };
  return Object.keys(m).sort().map((k) => m[k]);
}
// Gộp hai danh sách theo ngày; trùng ngày giữ bản có ngày đăng (pub) mới hơn
function unionRows(a, b, key = "d") {
  const m = byDate(a, key);
  for (const r of b || []) { const o = m[r[key]]; if (!o || (r.pub || "") > (o.pub || "")) m[r[key]] = r; }
  return Object.keys(m).sort().map((k) => m[k]);
}

// Lần đầu mở app (hoặc sau khi cập nhật app): gộp số liệu đóng gói sẵn vào thư mục người dùng
export function seedUserData() {
  const files = ["nhnn/central.json", "nhnn/reference.json", "nhnn/interbank.json", "nhnn/omo.json", "nhnn/cpi.json", "nhnn/policy.json", "nhnn/health.json", "ngan-hang/rates_history.json", "ngan-hang/latest_live.json"];
  let n = 0;
  for (const rel of files) {
    const src = path.join(SEED_DIR, rel);
    let seed; try { seed = JSON.parse(fs.readFileSync(src, "utf8")); } catch { continue; }
    const cur = readJson(rel, null);
    let next;
    if (cur == null) next = seed;
    else if (rel === "ngan-hang/rates_history.json") next = { ...seed, ...cur };
    else if (rel === "nhnn/cpi.json") next = unionRows(seed, cur, "thang");
    else if (Array.isArray(seed) && rel !== "nhnn/policy.json") next = unionRows(seed, cur);
    else continue; // health, policy, latest_live: giữ bản của máy
    if (JSON.stringify(next) !== JSON.stringify(cur)) { writeJson(rel, next); n++; }
  }
  return n;
}

// ------------------------------------------------------------------ gọi mạng
class Blocked extends Error {}
function session() {
  const st = { last: 0, calls: 0, blocked: false, timeouts: 0 };
  async function get(url, { tries = 2, timeout = 150000, json = false } = {}) {
    if (st.blocked) throw new Blocked("bỏ qua: NHNN đang chặn tạm trong lượt này");
    let last;
    for (let i = 0; i < tries; i++) {
      const wait = st.last + PACE_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        st.calls++;
        const r = await doFetch(url, { headers: { "User-Agent": UA, Accept: json ? "application/json" : "text/html,*/*;q=0.8", "Accept-Language": "vi-VN,vi;q=0.9" }, signal: AbortSignal.timeout(timeout) });
        st.last = Date.now();
        if (r.status === 200) return json ? r.json() : r.text();
        if (r.status === 403 || r.status === 429) { st.blocked = true; throw new Blocked(`HTTP ${r.status}: NHNN chặn tạm vì gọi nhiều, để lượt sau`); }
        last = `HTTP ${r.status}`;
      } catch (e) {
        if (e instanceof Blocked) throw e;
        st.last = Date.now(); last = e.message;
        if (++st.timeouts >= 3) { st.blocked = true; throw new Blocked(`NHNN không phản hồi (${last}), để lượt sau`); }
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(last);
  }
  return { st, get };
}
const z = (d) => d.toISOString().slice(0, 19) + "Z";
const apiUrl = (sid, flt, size) => `${API(sid)}?pageSize=${size || ({ 3450260: 150, 3450514: 150 }[sid] || 200)}&page=1&sort=datePublished:desc&fields=id,title,datePublished,contentFields${flt ? "&filter=" + encodeURIComponent(flt) : ""}`;

// ------------------------------------------------------------------ nguồn dự phòng (kho công khai)
async function mirrorNhnn(log) {
  const got = {}, okKeys = new Set();
  for (const k of ["central", "reference", "interbank", "omo", "cpi", "policy"]) {
    try {
      const r = await doFetch(`${MIRROR}radar/data/${k}.json?t=${Date.now()}`, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) && data.length) okKeys.add(k);
      const rel = `nhnn/${k}.json`, cur = readJson(rel, []);
      let next;
      if (k === "policy") next = data.length ? data : cur;
      else if (k === "cpi") next = unionRows(cur, data, "thang").map((row) => ({ ...(byDate(cur, "thang")[row.thang] || {}), ...row }));
      else next = unionRows(cur, data);
      if (JSON.stringify(next) !== JSON.stringify(cur)) { writeJson(rel, next); got[k] = next.length; }
    } catch (e) { log?.(`dự phòng ${k}: ${e.message}`); }
  }
  return { got, okKeys };
}

// ------------------------------------------------------------------ một lượt cập nhật NHNN
export async function updateNhnn({ force = false, log = () => {} } = {}) {
  const health = readJson("nhnn/health.json", { sources: {} });
  health.sources ||= {};
  const started = new Date(), today = todayVN(), hourVN = nowVN().getUTCHours();
  const since = new Date(Date.now() - 45 * 864e5);
  const { st, get } = session();
  const results = {};

  let mirrorOk = new Set();
  if (getConfig().mirror !== false) {
    const { got, okKeys } = await mirrorNhnn(log);
    mirrorOk = okKeys;
    health.du_phong = { luc: vnIso(), cap_nhat: got };
    for (const [k, n] of Object.entries(got)) {
      const rows = readJson(`nhnn/${k}.json`, []), s = (health.sources[k] ||= {});
      if (k !== "policy") Object.assign(s, { so_ban_ghi: n, ky_moi_nhat: rows.at(-1)?.d || rows.at(-1)?.thang, ky_dau_tien: rows[0]?.d || rows[0]?.thang });
    }
  }

  const due = (key) => {
    if (force) return true;
    const s = health.sources[key] || {};
    const ago = s.kiem_tra ? (Date.now() - Date.parse(s.kiem_tra)) / 3600e3 : Infinity;
    if (!isFinite(ago) || s.trang_thai !== "ok") return true;
    const latest = s.ky_moi_nhat || "";
    if (key === "central" || key === "reference") return latest < today || ago >= 6;
    if (key === "omo") return (latest < today && hourVN >= 9) || ago >= 6;
    if (key === "interbank") return ago >= 2;
    return ago >= 12;
  };
  const step = async (key, fn) => {
    const s = (health.sources[key] ||= {});
    Object.assign(s, { ten: TITLES[key], link: LINKS[key] });
    if (!due(key)) { results[key] = s.trang_thai || "ok"; return; }
    if (st.calls >= MAX_CALLS) { results[key] = s.trang_thai || "cho"; s.trang_thai ||= "cho"; log(`${key}: để lượt sau`); return; }
    const t0 = Date.now();
    s.kiem_tra = started.toISOString();
    try {
      const info = await fn();
      Object.assign(s, { trang_thai: "ok", loi: null, thoi_gian_s: Math.round((Date.now() - t0) / 100) / 10, ...info });
      log(`OK ${key}: ${JSON.stringify(info)}`);
    } catch (e) {
      // không gọi được NHNN nhưng số vẫn mới (hoặc nguồn dự phòng vừa trả số): không coi là lỗi
      const fresh = (s.ky_moi_nhat || "") >= today || mirrorOk.has(key);
      Object.assign(s, { trang_thai: fresh ? "ok" : "loi", loi: (fresh ? "Không gọi được NHNN trực tiếp, đang dùng số từ nguồn dự phòng: " : "") + String(e.message).slice(0, 300), thoi_gian_s: Math.round((Date.now() - t0) / 100) / 10 });
      log(`LỖI ${key}: ${e.message}`);
    }
    results[key] = s.trang_thai;
  };
  const info = (rows) => ({ so_ban_ghi: rows.length, ky_moi_nhat: rows.at(-1)?.d ?? null, ky_dau_tien: rows[0]?.d ?? null });
  const series = (key, parser) => async () => {
    const j = await get(apiUrl(STRUCTURES[key], `datePublished ge ${z(since)}`), { json: true });
    const rows = mergeRows(readJson(`nhnn/${key}.json`, []), parser(j.items || []));
    writeJson(`nhnn/${key}.json`, rows);
    return info(rows);
  };

  await step("central", series("central", parseCentral));
  await step("reference", series("reference", parseReference));
  await step("omo", async () => {
    const rec = parseOmo(await get(PAGES.omo));
    const rows = mergeRows(readJson("nhnn/omo.json", []), { [rec.d]: rec });
    writeJson("nhnn/omo.json", rows);
    return info(rows);
  });
  await step("interbank", series("interbank", parseInterbank));
  await step("cpi", async () => {
    const fresh = parseCpi(await get(PAGES.cpi));
    const cur = byDate(readJson("nhnn/cpi.json", []), "thang");
    for (const [k, v] of Object.entries(fresh)) cur[k] = { ...(cur[k] || {}), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x != null)) };
    try {
      for (const s of JSON.parse(fs.readFileSync(path.join(ROOT, "crawler", "cpi_seed.json"), "utf8"))) {
        const row = (cur[s.thang] ||= { thang: s.thang });
        for (const kk of ["yoy", "co_ban_yoy"]) if (row[kk] == null && s[kk] != null) { row[kk] = s[kk]; row[kk + "_nguon"] = s.nguon; }
      }
    } catch { /* không có tệp bù */ }
    const rows = Object.keys(cur).sort().map((k) => cur[k]);
    writeJson("nhnn/cpi.json", rows);
    return { so_ban_ghi: rows.length, ky_moi_nhat: rows.at(-1).thang, ky_dau_tien: rows[0].thang };
  });
  await step("policy", async () => {
    const j = await get(apiUrl(STRUCTURES.policy), { json: true });
    const rows = parsePolicy(j.items || []);
    if (!rows.length) throw new Error("Không có dòng lãi suất điều hành");
    writeJson("nhnn/policy.json", rows);
    return { so_ban_ghi: rows.length, ky_moi_nhat: rows.map((r) => r.ap_dung || "").sort().at(-1) };
  });

  Object.assign(health, { lan_chay: vnIso(), may_chay: "may-tinh-cfo", so_lan_goi: st.calls });
  writeJson("nhnn/health.json", health);
  return { results, calls: st.calls, mirror: health.du_phong?.cap_nhat || {} };
}

// ------------------------------------------------------------------ giá USD ngân hàng
const valid = (q) => { const s = +q?.sell, t = +(q?.transfer || q?.cash); return isFinite(s) && isFinite(t) && t > 15000 && t <= s && s < 40000; };
async function bankVCB() {
  const r = await doFetch("https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  const x = await r.text();
  const m = /<Exrate[^>]*CurrencyCode="USD"[^>]*>/i.exec(x);
  if (!m) return null;
  const a = (k) => vnNum((new RegExp(`${k}="([^"]*)"`).exec(m[0]) || [])[1]?.replace(/,/g, ""));
  return { cash: a("Buy"), transfer: a("Transfer"), sell: a("Sell") };
}
async function bankACB() {
  const t = nowVN().toISOString().slice(0, 19) + ".000";
  const r = await doFetch(`https://acb.com.vn/api/front/v1/currency?currency=VND&effectiveDateTime=${t}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
  const j = await r.json(); const q = { cash: null, transfer: null, sell: null };
  for (const it of Array.isArray(j) ? j : []) {
    if (it.exchangeCurrency !== "USD") continue;
    const rate = +it.exchangeRate;
    if (it.dealType === "BID" && it.instrumentType === "TRANSFER") q.transfer = rate;
    else if (it.dealType === "BID" && it.instrumentType === "CASH" && it.denomination === 3) q.cash = rate;
    else if (it.dealType === "ASK" && (it.denomination === 3 || it.denomination == null)) q.sell = rate;
  }
  return q.transfer && q.sell ? q : null;
}
async function bankMSB() {
  const d = nowVN().toISOString().slice(0, 10).split("-").reverse().join("/");
  const base = "https://digibank-api-business.msb.com.vn/api/corp-foreign-exchange/client-api/v1/exchange-rates/public";
  const b = await (await doFetch(`${base}/board-info?boardDate=${encodeURIComponent(d)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) })).json();
  if (!b?.length) return null;
  const j = await (await doFetch(`${base}?boardDate=${encodeURIComponent(d)}&boardNumber=${b[0].boardNumber}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) })).json();
  const c = (j.currencyOverview || []).find((x) => x.currencyCode === "USD" && x.exchangeRatesData?.length);
  if (!c) return null;
  const e = c.exchangeRatesData[0], buy = +String(e.buyRateValue).replace(/,/g, ""), sell = +String(e.sellRateValue).replace(/,/g, "");
  return buy > 0 && sell > 0 ? { cash: buy, transfer: buy, sell } : null;
}

export async function updateBanks({ log = () => {} } = {}) {
  const hist = readJson("ngan-hang/rates_history.json", {});
  const before = JSON.stringify(hist);
  let upTs = null;
  if (getConfig().mirror !== false) {
    try {
      const h = await (await doFetch(MIRROR + "rates_history.json?t=" + Date.now(), { signal: AbortSignal.timeout(60000) })).json();
      const live = await (await doFetch(MIRROR + "latest_live.json?t=" + Date.now(), { signal: AbortSignal.timeout(30000) })).json().catch(() => null);
      if (live?.date_iso && live.banks) h[live.date_iso] = { date_dd: live.date_dd, banks: { ...(h[live.date_iso]?.banks || {}), ...live.banks } };
      for (const [d, v] of Object.entries(h)) {
        const banks = Object.fromEntries(Object.entries(v.banks || {}).filter(([, q]) => valid(q)));
        if (Object.keys(banks).length) (hist[d] ||= { date_dd: v.date_dd, banks: {} }).banks = { ...hist[d].banks, ...banks };
      }
      upTs = live?.timestamp || null;
    } catch (e) { log(`bảng ngân hàng dự phòng: ${e.message}`); }
  }
  const direct = {};
  for (const [name, fn] of [["Vietcombank", bankVCB], ["ACB", bankACB], ["MSB", bankMSB]]) {
    try { const q = await fn(); if (q && valid(q)) direct[name] = q; else log(`${name}: không có số hợp lệ`); }
    catch (e) { log(`${name}: ${e.message}`); }
  }
  const today = todayVN();
  if (Object.keys(direct).length) (hist[today] ||= { date_dd: today.split("-").reverse().join("/"), banks: {} }).banks = { ...hist[today].banks, ...direct };
  const keys = Object.keys(hist).sort();
  if (!keys.length) return { days: 0 };
  const sorted = Object.fromEntries(keys.map((k) => [k, hist[k]]));
  if (JSON.stringify(sorted) !== before) writeJson("ngan-hang/rates_history.json", sorted);
  const last = keys.at(-1);
  writeJson("ngan-hang/latest_live.json", { timestamp: vnIso(), date_iso: last, date_dd: hist[last].date_dd, banks: hist[last].banks, cao_thang: Object.keys(direct), nguon_bang: upTs ? "vcb-exchange-rate" : null, nguon_bang_luc: upTs });
  return { days: keys.length, last, direct: Object.keys(direct) };
}

// ------------------------------------------------------------------ chạy một lượt đầy đủ (không chạy chồng)
let running = null;
export const state = { lastRun: null, lastResult: null, lastError: null, log: [] };
export function updateAll(opts = {}) {
  if (running) return running;
  const log = (m) => { state.log = [...state.log, `${new Date().toLocaleTimeString("vi-VN")} ${m}`].slice(-80); opts.log?.(m); };
  running = (async () => {
    try {
      const nhnn = await updateNhnn({ ...opts, log });
      const banks = await updateBanks({ log });
      state.lastResult = { nhnn, banks }; state.lastError = null;
      return state.lastResult;
    } catch (e) { state.lastError = e.message; throw e; }
    finally { state.lastRun = new Date().toISOString(); running = null; }
  })();
  return running;
}
export const isRunning = () => Boolean(running);
