// Đọc số liệu cho API trên Vercel. Tệp data/** và assets/ontology.json được đóng gói kèm hàm
// (vercel.json → functions.includeFiles), nên đọc thẳng từ đĩa, không gọi mạng.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FILES, buildTables, computeMetrics } from "./core.js";

const ROOT = process.env.CFO_ROOT || process.cwd();
let cache = null;

async function json(rel) {
  try { return JSON.parse(await readFile(path.join(ROOT, rel), "utf8")); } catch { return null; }
}

export async function load() {
  if (cache) return cache; // số liệu bất biến trong một lần deploy
  const vals = await Promise.all(Object.values(FILES).map((f) => json("data/" + f)));
  const raw = Object.fromEntries(Object.keys(FILES).map((k, i) => [k, vals[i]]));
  const ont = await json("assets/ontology.json");
  const t = buildTables(raw);
  cache = { raw, ont, t, M: computeMetrics(t) };
  return cache;
}

// Đầu trả lời chung: CORS mở cho GET (số liệu công khai), cache ở CDN của Vercel.
export function send(res, status, body, { type = "application/json; charset=utf-8", maxAge = 900, filename } = {}) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", status === 200 ? `public, s-maxage=${maxAge}, stale-while-revalidate=3600` : "no-store");
  res.setHeader("Content-Type", type);
  if (filename) res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.status(status).send(typeof body === "string" ? body : JSON.stringify(body, null, 1));
}

export function guard(req, res) {
  if (req.method === "OPTIONS") { send(res, 204, ""); return false; }
  if (req.method !== "GET" && req.method !== "HEAD") { send(res, 405, { loi: "Chỉ nhận GET" }); return false; }
  return true;
}

export const lastDate = (rows) => rows.length ? (rows.at(-1).ngay || rows.at(-1).thang || null) : null;
