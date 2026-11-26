// GET /api/v1/bang            – danh sách bảng
// GET /api/v1/bang/{ten}      – dữ liệu một bảng (vercel.json viết lại thành ?ten=)
//   tu, den      lọc theo ngày (YYYY-MM-DD; với cpi là tháng YYYY-MM)
//   gioi_han     chỉ lấy N dòng cuối
//   dinh_dang    json (mặc định) | csv
//   <cột>=<giá trị>  lọc bằng nhau, vd ngoai_te=USD, ky_han=ON, ngan_hang=Vietcombank
import { load, guard, send, lastDate } from "../../lib/server.js";
import { filterRows, toCSV } from "../../lib/core.js";

const RESERVED = new Set(["ten", "tu", "den", "gioi_han", "dinh_dang"]);

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const { t, ont } = await load();
  const q = req.query || {};
  const ten = String(q.ten || "").replace(/\.(csv|json)$/i, "");
  const fmt = String(q.dinh_dang || (/\.csv$/i.test(q.ten || "") ? "csv" : "json")).toLowerCase();

  if (!ten) {
    return send(res, 200, {
      bang: (ont?.datasets || []).map((d) => ({
        ten: d.name, nhan: d.label, mo_ta: d.description, do_hat: d.grain,
        so_dong: t[d.name]?.length ?? 0, moi_nhat: lastDate(t[d.name] || []),
        cot: d.fields.map((f) => ({ ten: f.name, kieu: f.type, mo_ta: f.description })),
        csv: `/api/v1/bang/${d.name}?dinh_dang=csv`,
      })),
    });
  }
  const rows = t[ten];
  if (!rows) return send(res, 404, { loi: `Không có bảng ${ten}`, bang_hop_le: Object.keys(t) });

  const eq = Object.fromEntries(Object.entries(q).filter(([k]) => !RESERVED.has(k) && rows[0] && k in rows[0]));
  let tu = q.tu, den = q.den;
  if (ten === "cpi") { tu = tu && tu.slice(0, 7) + "-01"; den = den && den.slice(0, 7) + "-01"; }
  let out = filterRows(rows, { tu, den, ...eq });
  const n = parseInt(q.gioi_han, 10);
  if (n > 0) out = out.slice(-n);

  if (fmt === "csv") return send(res, 200, toCSV(out), { type: "text/csv; charset=utf-8", filename: `${ten}.csv` });
  send(res, 200, { bang: ten, so_dong: out.length, moi_nhat: lastDate(out), du_lieu: out });
}
