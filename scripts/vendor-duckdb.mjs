// Đóng gói DuckDB-WASM vào assets/vendor/duckdb để app chạy SQL không cần mạng.
// Chạy tự động trước khi build (npm run vendor). Thư mục vendor không đưa vào git.
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const dist = path.resolve("node_modules/@duckdb/duckdb-wasm/dist");
const out = path.resolve("assets/vendor/duckdb");
fs.mkdirSync(out, { recursive: true });
await build({ entryPoints: [path.join(dist, "duckdb-browser.mjs")], bundle: true, format: "esm", platform: "browser", minify: true, outfile: path.join(out, "duckdb.mjs"), logLevel: "warning" });
for (const f of ["duckdb-browser-eh.worker.js", "duckdb-eh.wasm"]) fs.copyFileSync(path.join(dist, f), path.join(out, f));
console.log("DuckDB đã đóng gói vào", out, fs.readdirSync(out).map((f) => `${f} ${(fs.statSync(path.join(out, f)).size / 1e6).toFixed(1)}MB`).join(", "));
