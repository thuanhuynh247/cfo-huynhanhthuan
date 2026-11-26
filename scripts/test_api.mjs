// Thử các hàm API ngay trên máy, không cần Vercel: node scripts/test_api.mjs
// Giả lập req/res giống Node helpers của Vercel (req.query, res.status().send()).
import assert from "node:assert/strict";
const mk = (query = {}, method = "GET") => ({ method, query, headers: { host: "cfo.huynhanhthuan.com" } });
function res() {
  const r = { code: 0, headers: {}, body: "" };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.json = (o) => { r.setHeader("content-type", "application/json"); r.body = JSON.stringify(o); return r; };
  return r;
}
const call = async (file, q, method) => { const h = (await import(`../api/v1/${file}.js`)).default; const r = res(); await h(mk(q, method), r); return r; };
const J = (r) => JSON.parse(r.body);
let ok = 0; const t = async (name, fn) => { await fn(); ok++; console.log("✓", name); };

await t("danh mục", async () => { const r = await call("index"); assert.equal(r.code, 200); assert.ok(J(r).diem_truy_cap.length >= 5); });
await t("tổng quan có tỷ giá trung tâm và tín hiệu", async () => {
  const r = await call("tong-quan"); assert.equal(r.code, 200);
  const b = J(r); assert.ok(b.chi_so.ty_gia_trung_tam.gia_tri > 20000); assert.ok(Array.isArray(b.tin_hieu));
  assert.equal(r.headers["access-control-allow-origin"], "*");
  console.log("   ", JSON.stringify(b.chi_so.ty_gia_trung_tam), "| tín hiệu:", b.tin_hieu.map((s) => s.ten).join("; "));
});
await t("danh sách bảng đủ 7", async () => { const b = J(await call("bang")); assert.equal(b.bang.length, 7); assert.ok(b.bang.every((x) => x.so_dong > 0)); });
await t("bảng CSV có BOM và tiêu đề", async () => { const r = await call("bang", { ten: "ty_gia_trung_tam", dinh_dang: "csv" }); assert.match(r.headers["content-type"], /text\/csv/); assert.ok(r.body.startsWith("﻿ngay,ty_gia")); });
await t("đuôi .csv cũng ra CSV", async () => { const r = await call("bang", { ten: "cpi.csv" }); assert.match(r.headers["content-type"], /text\/csv/); });
await t("lọc theo ngày và cột", async () => {
  const b = J(await call("bang", { ten: "lai_suat_lien_ngan_hang", ky_han: "ON", tu: "2026-01-01" }));
  assert.ok(b.so_dong > 50); assert.ok(b.du_lieu.every((x) => x.ky_han === "ON" && x.ngay >= "2026-01-01"));
});
await t("giới hạn dòng cuối", async () => { const b = J(await call("bang", { ten: "ty_gia_tham_khao", ngoai_te: "usd", gioi_han: "3" })); assert.equal(b.so_dong, 3); });
await t("cpi lọc theo tháng", async () => { const b = J(await call("bang", { ten: "cpi", tu: "2026-01" })); assert.ok(b.du_lieu.every((x) => x.thang >= "2026-01-01")); });
await t("bảng không tồn tại → 404", async () => { const r = await call("bang", { ten: "khong_co" }); assert.equal(r.code, 404); });
await t("POST bị từ chối", async () => { const r = await call("bang", {}, "POST"); assert.equal(r.code, 405); });
await t("sức khoẻ", async () => { const b = J(await call("suc-khoe")); assert.ok(b.nhnn.lan_chay); assert.ok(b.ngan_hang.so_ngan_hang >= 3); });
await t("ontology", async () => { const b = J(await call("ontology")); assert.equal(b.metrics.length, 10); });
await t("ai không có khoá → 503", async () => { delete process.env.ANTHROPIC_API_KEY; const r = await call("ai", {}, "POST"); assert.equal(r.code, 503); });
console.log(`\n${ok} phép thử API đạt.`);
