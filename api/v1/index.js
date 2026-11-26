// GET /api/v1 – danh mục API
import { guard, send } from "../../lib/server.js";

export default function handler(req, res) {
  if (!guard(req, res)) return;
  const o = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  send(res, 200, {
    ten: "CFO Terminal API",
    mo_ta: "Số liệu tiền tệ NHNN và giá USD ngân hàng, do bộ cào của dự án cập nhật. Chỉ đọc, không cần khoá.",
    diem_truy_cap: [
      { duong_dan: "/api/v1/tong-quan", mo_ta: "Chỉ số chính và tín hiệu rủi ro hôm nay", vi_du: o + "/api/v1/tong-quan" },
      { duong_dan: "/api/v1/bang", mo_ta: "Danh sách bảng: cột, số dòng, ngày mới nhất", vi_du: o + "/api/v1/bang" },
      { duong_dan: "/api/v1/bang/{ten}", mo_ta: "Dữ liệu một bảng. Tham số: tu=YYYY-MM-DD, den=YYYY-MM-DD, gioi_han=số dòng cuối, dinh_dang=csv|json, và lọc bằng tên cột (vd ngoai_te=USD, ky_han=ON)", vi_du: o + "/api/v1/bang/ty_gia_trung_tam?dinh_dang=csv" },
      { duong_dan: "/api/v1/suc-khoe", mo_ta: "Lần cào gần nhất và trạng thái từng nguồn", vi_du: o + "/api/v1/suc-khoe" },
      { duong_dan: "/api/v1/ontology", mo_ta: "Ontology: bảng, khái niệm, chỉ số, công thức SQL, nguồn gốc", vi_du: o + "/api/v1/ontology" },
      { duong_dan: "/api/v1/ai", mo_ta: "POST, cần mã truy cập (x-cfo-code). Chuyển tiếp tới Anthropic cho lệnh hoi.", vi_du: null },
    ],
    excel: "Data → From Web → dán địa chỉ có dinh_dang=csv → Load; Refresh All để cập nhật.",
    google_sheets: `=IMPORTDATA("${o}/api/v1/bang/ty_gia_trung_tam?dinh_dang=csv")`,
  }, { maxAge: 86400 });
}
