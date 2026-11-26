// store.mjs — Cấu hình và kho khoá API, lưu cục bộ trên máy người dùng (không gửi đi đâu)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const home = os.homedir();
const isWin = process.platform === "win32";

export const DATA_DIR = process.env.CFO_DATA_DIR
  || (isWin ? path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "CFO Terminal") : path.join(home, ".cfo-terminal"));
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const DEFAULT_CONFIG = {
  engine: "",          // nền tảng AI chính (claude, codex, gemini, ollama, anthropic-api…)
  model: "",
  fallback: [],        // nền tảng dự phòng, gọi lần lượt khi nền tảng chính lỗi
  apiKeys: {},         // khoá API, chỉ nằm trong %APPDATA%\CFO Terminal\config.json
  autoUpdate: true,    // tự cập nhật số liệu khi mở app và mỗi giờ
  mirror: true,        // dùng kho công khai vcb-exchange-rate làm nguồn dự phòng
};

let cache = null;

export function getConfig() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
  } catch {
    cache = { ...DEFAULT_CONFIG };
  }
  return cache;
}

export function updateConfig(patch = {}) {
  const cur = getConfig();
  const next = { ...cur };
  for (const k of ["engine", "model"]) if (typeof patch[k] === "string") next[k] = patch[k].trim();
  for (const k of ["autoUpdate", "mirror"]) if (typeof patch[k] === "boolean") next[k] = patch[k];
  if (Array.isArray(patch.fallback)) next.fallback = patch.fallback.filter((x) => typeof x === "string").slice(0, 4);
  if (patch.apiKeys && typeof patch.apiKeys === "object") {
    next.apiKeys = { ...cur.apiKeys };
    for (const [k, v] of Object.entries(patch.apiKeys)) {
      if (!/^[A-Z_]+$/.test(k)) continue;
      if (v === null || v === "") delete next.apiKeys[k];
      else if (typeof v === "string") next.apiKeys[k] = v.trim();
    }
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  cache = next;
  return getPublicConfig();
}

// Bản trả cho giao diện: khoá chỉ hiện 4 ký tự đầu và cuối
export function getPublicConfig() {
  const c = getConfig();
  const masked = {};
  for (const [k, v] of Object.entries(c.apiKeys || {})) masked[k] = v ? `${String(v).slice(0, 4)}…${String(v).slice(-4)}` : "";
  return { ...c, apiKeys: masked, dataDir: DATA_DIR };
}
