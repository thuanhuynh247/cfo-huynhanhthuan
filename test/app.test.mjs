// Kiểm thử app: bộ cào Node (so với bản Python trên mẫu thật của sbv.gov.vn), máy chủ cục bộ, API cho Excel, AI giả
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, "fixtures", "sbv");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cfo-"));
process.env.CFO_DATA_DIR = tmp;
process.env.CFO_NO_UPDATE = "1";
process.env.CFO_PACE_MS = "0";
process.env.CFO_MOCK_AI = path.join(HERE, "mock-ai.mjs");
const C = await import("../server/crawler.mjs");
const { startServer } = await import("../server/index.mjs");
const { updateConfig } = await import("../server/store.mjs");

const norm = (x) => Array.isArray(x) ? x.map(norm) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm(x[k])])) : x;
const items = (n) => JSON.parse(fs.readFileSync(path.join(FX, n), "utf8")).items;
const html = (n) => fs.readFileSync(path.join(FX, n), "utf8");

test("bộ đọc Node cho kết quả giống hệt bản Python trên mẫu thật của NHNN", () => {
  const exp = JSON.parse(fs.readFileSync(path.join(FX, "expected.json"), "utf8"));
  const got = { central: C.parseCentral(items("central.json")), reference: C.parseReference(items("reference.json")), interbank: C.parseInterbank(items("interbank.json")), policy: C.parsePolicy(items("policy.json")), omo: C.parseOmo(html("omo.html")), cpi: C.parseCpi(html("cpi.html")) };
  for (const k of Object.keys(exp)) assert.deepEqual(norm(got[k]), norm(exp[k]), k);
});

test("số kiểu Việt Nam và ngày theo giờ Việt Nam", () => {
  assert.equal(C.vnNum("1.053.948,0"), 1053948); assert.equal(C.vnNum("4,69"), 4.69); assert.equal(C.vnNum("25.676"), 25676); assert.equal(C.vnNum("-"), null);
  assert.equal(C.isoToVnDate("2026-11-25T17:00:00Z"), "2026-11-26");
});

test("một lượt cập nhật: gộp số mới, ghi sức khoẻ, tôn trọng giới hạn 4 lần gọi, bị chặn thì dừng", async () => {
  updateConfig({ mirror: false });
  C.seedUserData();
  const before = C.readJson("nhnn/central.json", []).length;
  const calls = [];
  C.setFetch(async (url) => {
    calls.push(url);
    const body = /137473/.test(url) ? fs.readFileSync(path.join(FX, "central.json"), "utf8")
      : /3450514/.test(url) ? fs.readFileSync(path.join(FX, "reference.json"), "utf8")
      : /th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F/.test(url) ? html("omo.html")
      : null;
    if (body == null) return new Response("chặn", { status: 403 });
    return new Response(body, { status: 200 });
  });
  const r = await C.updateNhnn({ force: true });
  assert.equal(r.results.central, "ok"); assert.equal(r.results.reference, "ok"); assert.equal(r.results.omo, "ok");
  assert.notEqual(r.results.interbank, "ok", "lần gọi thứ 4 bị chặn");
  assert.ok(r.calls <= 4, "không quá 4 lần gọi");
  assert.ok(!calls.some((u) => /\/vi\/cpi/.test(u)), "bị chặn rồi thì không gọi tiếp");
  const h = C.readJson("nhnn/health.json", {});
  assert.equal(h.may_chay, "may-tinh-cfo");
  assert.ok(C.readJson("nhnn/central.json", []).length >= before, "không mất dòng");
  assert.ok(C.readJson("nhnn/omo.json", []).some((x) => x.d === "2026-11-26"));
});

test("máy chủ cục bộ: giao diện, số liệu, API cho Excel, chặn trang lạ, AI theo giao thức hành động", async () => {
  const { server, url } = await startServer({ port: 0, autoUpdate: false });
  try {
    const get = (p, h = {}) => fetch(url + p, { headers: h });
    assert.match(await (await get("/")).text(), /CFO Terminal/);
    assert.equal((await get("/lib/core.js")).status, 200);
    assert.equal((await get("/server/store.mjs")).status, 404, "không lộ mã máy chủ");
    assert.equal((await get("/assets/../server/store.mjs")).status, 404);
    const c = await (await get("/data/nhnn/central.json")).json();
    assert.ok(c.length > 100);
    const tq = await (await get("/api/v1/tong-quan")).json();
    assert.ok(tq.chi_so.ty_gia_trung_tam.gia_tri > 20000);
    const csv = await get("/api/v1/bang/ty_gia_trung_tam?dinh_dang=csv");
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    const bytes = Buffer.from(await csv.arrayBuffer());
    assert.equal(bytes.subarray(0, 3).toString("hex"), "efbbbf", "có BOM để Excel đọc đúng tiếng Việt");
    assert.ok(bytes.toString("utf8").slice(1).startsWith("ngay,ty_gia"));
    const on = await (await get("/api/v1/bang/lai_suat_lien_ngan_hang?ky_han=ON&gioi_han=5")).json();
    assert.equal(on.so_dong, 5);
    assert.equal((await get("/api/v1/bang/khong_co")).status, 404);
    assert.equal((await get("/api/config", { Origin: "https://trang-la.example" })).status, 403, "chặn trang web lạ");
    const cfg = await (await get("/api/config")).json();
    assert.equal(cfg.dataDir, tmp);
    const post = async (p, b) => (await fetch(url + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json();
    await post("/api/config", { engine: "claude", apiKeys: { ANTHROPIC_API_KEY: "sk-ant-thu-nghiem-1234" } });
    assert.equal((await (await get("/api/config")).json()).apiKeys.ANTHROPIC_API_KEY, "sk-a…1234", "khoá chỉ hiện dạng che");
    const ai = await post("/api/ai/run", { prompt: "HÀNH ĐỘNG tiếp theo?" });
    assert.match(ai.text, /retrieve/);
    const eng = await (await get("/api/engines")).json();
    assert.ok(eng.some((e) => e.id === "claude") && eng.some((e) => e.id === "anthropic-api") && eng.some((e) => e.id === "ollama"));
  } finally { server.close(); }
});
