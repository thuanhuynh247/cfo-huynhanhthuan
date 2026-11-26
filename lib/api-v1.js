// API /api/v1 dùng chung (thuần JS, không phụ thuộc máy chủ): nhận đường dẫn + tham số, trả { status, body, type, filename }.
// Máy chủ cục bộ của app (server/index.mjs) gọi hàm này; Excel, Power BI trên cùng máy đọc qua http://127.0.0.1:47240/api/v1/...
import { summary, signals, todayVN, filterRows, toCSV } from "./core.js";

const RESERVED = new Set(["ten", "tu", "den", "gioi_han", "dinh_dang"]);
const lastDate = (rows) => rows.length ? (rows.at(-1).ngay || rows.at(-1).thang || null) : null;
const json = (body, status = 200) => ({ status, body, type: "application/json; charset=utf-8" });

export function apiV1(pathname, query, { raw, t, M, ont, origin }) {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/api/v1") {
    const o = origin;
    return json({
      ten: "CFO Terminal API (chạy trên máy này)",
      mo_ta: "Số liệu tiền tệ NHNN và giá USD ngân hàng do app tự cào. Chỉ đọc, chỉ nghe trên máy này (127.0.0.1), mở được khi app đang chạy.",
      diem_truy_cap: [
        { duong_dan: "/api/v1/tong-quan", mo_ta: "Chỉ số chính và tín hiệu rủi ro hôm nay", vi_du: o + "/api/v1/tong-quan" },
        { duong_dan: "/api/v1/bang", mo_ta: "Danh sách bảng: cột, số dòng, ngày mới nhất", vi_du: o + "/api/v1/bang" },
        { duong_dan: "/api/v1/bang/{ten}", mo_ta: "Dữ liệu một bảng. Tham số: tu=YYYY-MM-DD, den=YYYY-MM-DD, gioi_han=số dòng cuối, dinh_dang=csv|json, và lọc bằng tên cột (vd ngoai_te=USD, ky_han=ON)", vi_du: o + "/api/v1/bang/ty_gia_trung_tam?dinh_dang=csv" },
        { duong_dan: "/api/v1/suc-khoe", mo_ta: "Lần cào gần nhất và trạng thái từng nguồn", vi_du: o + "/api/v1/suc-khoe" },
        { duong_dan: "/api/v1/ontology", mo_ta: "Ontology: bảng, khái niệm, chỉ số, công thức SQL, nguồn gốc", vi_du: o + "/api/v1/ontology" },
      ],
      excel: "Data → From Web → dán địa chỉ có dinh_dang=csv → Load; Refresh All để cập nhật (app phải đang mở).",
    });
  }
  if (p === "/api/v1/tong-quan") {
    if (!M.last) return json({ loi: "Chưa có số liệu tỷ giá trung tâm" }, 503);
    return json({ ngay_tinh: todayVN(), chi_so: summary(M, raw), tin_hieu: signals(M, raw) });
  }
  if (p === "/api/v1/suc-khoe") {
    const h = raw.health || {};
    const loi = Object.values(h.sources || {}).filter((s) => s.trang_thai === "loi").length;
    return json({
      trang_thai: loi ? "co_loi" : "on",
      nhnn: { lan_chay: h.lan_chay || null, may_chay: h.may_chay || null, du_phong: h.du_phong || null, nguon: h.sources || {} },
      ngan_hang: { ngay_moi_nhat: lastDate(t.gia_usd_ngan_hang), cap_nhat_luc: raw.live?.timestamp || null, cao_thang: raw.live?.cao_thang || [], so_ngan_hang: Object.keys(raw.live?.banks || {}).length },
    });
  }
  if (p === "/api/v1/ontology") return ont ? json(ont) : json({ loi: "Thiếu ontology" }, 503);

  const m = /^\/api\/v1\/bang(?:\/([\w.]+))?$/.exec(p);
  if (m) {
    const q = { ...query };
    const tenRaw = m[1] || q.ten || "";
    const ten = String(tenRaw).replace(/\.(csv|json)$/i, "");
    const fmt = String(q.dinh_dang || (/\.csv$/i.test(tenRaw) ? "csv" : "json")).toLowerCase();
    if (!ten) {
      return json({
        bang: (ont?.datasets || []).map((d) => ({
          ten: d.name, nhan: d.label, mo_ta: d.description, do_hat: d.grain,
          so_dong: t[d.name]?.length ?? 0, moi_nhat: lastDate(t[d.name] || []),
          cot: d.fields.map((f) => ({ ten: f.name, kieu: f.type, mo_ta: f.mo_ta || f.description })),
          csv: `/api/v1/bang/${d.name}?dinh_dang=csv`,
        })),
      });
    }
    const rows = t[ten];
    if (!rows) return json({ loi: `Không có bảng ${ten}`, bang_hop_le: Object.keys(t) }, 404);
    const eq = Object.fromEntries(Object.entries(q).filter(([k]) => !RESERVED.has(k) && rows[0] && k in rows[0]));
    let tu = q.tu, den = q.den;
    if (ten === "cpi") { tu = tu && tu.slice(0, 7) + "-01"; den = den && den.slice(0, 7) + "-01"; }
    let out = filterRows(rows, { tu, den, ...eq });
    const n = parseInt(q.gioi_han, 10);
    if (n > 0) out = out.slice(-n);
    if (fmt === "csv") return { status: 200, body: toCSV(out), type: "text/csv; charset=utf-8", filename: `${ten}.csv` };
    return json({ bang: ten, so_dong: out.length, moi_nhat: lastDate(out), du_lieu: out });
  }
  return json({ loi: "Không có điểm truy cập này. Xem /api/v1" }, 404);
}
