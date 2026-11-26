// electron/main.mjs — Vỏ Windows của CFO Terminal: chạy máy chủ cục bộ trong tiến trình chính,
// mở cửa sổ ứng dụng, lưu tệp qua hộp thoại Windows. Cách làm giống MedSlide VI Studio.
import { app, BrowserWindow, shell, dialog, Menu, ipcMain, net } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let win = null;
let baseUrl = "";

async function boot() {
  const crawler = await import("../server/crawler.mjs");
  crawler.setFetch((url, opts) => net.fetch(url, opts)); // theo proxy/chứng chỉ của Windows
  const { startServer, DEFAULT_PORT } = await import("../server/index.mjs");
  try {
    ({ url: baseUrl } = await startServer({ port: DEFAULT_PORT, autoUpdate: !process.env.CFO_SMOKE }));
  } catch {
    ({ url: baseUrl } = await startServer({ port: 0, autoUpdate: !process.env.CFO_SMOKE }));
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 900, minHeight: 600,
    title: "CFO Terminal", autoHideMenuBar: true, backgroundColor: "#F4F6F9",
    icon: path.join(ROOT, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(baseUrl)) shell.openExternal(url);
    else if (url.startsWith(baseUrl)) shell.openExternal(url); // /api/v1/... mở bằng trình duyệt
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(baseUrl)) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL(baseUrl + "/");
}

function registerIpc() {
  // Lưu văn bản (CSV, Markdown) qua hộp thoại Windows
  ipcMain.handle("file:saveText", async (_e, name, text) => {
    const ext = path.extname(String(name || "")).slice(1) || "txt";
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("documents"), String(name || "cfo.txt")), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    fs.writeFileSync(r.filePath, String(text ?? ""), "utf8");
    return { canceled: false, path: r.filePath };
  });
  ipcMain.handle("shell:openExternal", (_e, u) => (/^https?:\/\//.test(u) ? shell.openExternal(u) : false));
  ipcMain.handle("shell:openPath", (_e, p) => shell.openPath(String(p || "")));
  ipcMain.handle("app:info", () => ({ version: app.getVersion(), baseUrl, dataDir: path.join(app.getPath("appData"), "CFO Terminal") }));
}

// Kiểm thử khói (CI): mở cửa sổ, chạy vài lệnh, chụp màn hình rồi thoát
async function smoke(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise((ok) => win.webContents.once("did-finish-load", ok));
  await win.webContents.executeJavaScript(`new Promise((ok, no) => { const t0 = Date.now(); (function w() { if (document.querySelector('.kpis')) ok(); else if (Date.now() - t0 > 30000) no(new Error('không thấy tổng quan')); else setTimeout(w, 200); })(); })`);
  await new Promise((ok) => setTimeout(ok, 800));
  fs.writeFileSync(path.join(outDir, "window.png"), (await win.webContents.capturePage()).toPNG());
  const r = await fetch(baseUrl + "/api/v1/tong-quan");
  const j = await r.json();
  if (!j.chi_so?.ty_gia_trung_tam?.gia_tri) throw new Error("API tong-quan không có tỷ giá");
  console.log("SMOKE_OK", baseUrl, j.chi_so.ty_gia_trung_tam.ngay);
  fs.writeFileSync(path.join(outDir, "ok.txt"), `SMOKE_OK ${baseUrl} ${j.chi_so.ty_gia_trung_tam.ngay}`);
  app.exit(0);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    try {
      registerIpc(); await boot(); createWindow();
      if (process.env.CFO_SMOKE) smoke(process.env.CFO_SMOKE).catch((e) => { console.error("SMOKE_FAIL", e.message); app.exit(1); });
    } catch (e) { dialog.showErrorBox("CFO Terminal", e?.stack || String(e)); app.quit(); }
  });
  app.on("window-all-closed", () => app.quit());
}
