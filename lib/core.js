// Lõi tính toán dùng chung cho trang (assets/app.js) và API (api/v1/*).
// Không đụng DOM, không gọi mạng: nhận số liệu thô, trả bảng, chỉ số, tín hiệu.
// Định nghĩa chỉ số khớp với ontology (ontology/build_ontology.py).

// ---------------------------------------------------------------- định dạng
export const N = (n, d = 0) => (n == null || !isFinite(n)) ? "—" : Number(n).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const S = (n, d = 0) => (n == null || !isFinite(n)) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "±") + N(Math.abs(n), d);
export const DMY = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
export const MY = (iso) => iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
export const T = (iso) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
export const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export const days = (a, b) => Math.round((T(b) - T(a)) / 864e5);
export const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
export const median = (a) => { const s = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const round = (v, d = 2) => v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- tệp số liệu (đường dẫn tương đối với thư mục data/)
export const FILES = {
  central: "nhnn/central.json", reference: "nhnn/reference.json", interbank: "nhnn/interbank.json",
  policy: "nhnn/policy.json", omo: "nhnn/omo.json", cpi: "nhnn/cpi.json", health: "nhnn/health.json",
  history: "ngan-hang/rates_history.json", live: "ngan-hang/latest_live.json",
};

// ---------------------------------------------------------------- dựng bảng đúng như ontology mô tả
export function buildTables(raw) {
  const t = {};
  t.ty_gia_trung_tam = (raw.central || []).map((r) => ({ ngay: r.d, ty_gia: r.v, so_van_ban: r.vb || null }));
  t.ty_gia_tham_khao = (raw.reference || []).flatMap((r) => Object.entries(r.fx || {}).map(([k, v]) => ({ ngay: r.d, ngoai_te: k, mua: v[0], ban: v[1] })));
  t.lai_suat_lien_ngan_hang = (raw.interbank || []).flatMap((r) => Object.entries(r.r || {}).map(([k, v]) => ({ ngay: r.d, ky_han: k, lai_suat: v, doanh_so: r.vol?.[k] ?? null, ghi_chu: r.note?.[k] || null })));
  t.lai_suat_dieu_hanh = (raw.policy || []).map((r) => ({ loai: r.loai, gia_tri: r.gia_tri, van_ban: r.van_ban, ap_dung: r.ap_dung }));
  t.omo = (raw.omo || []).flatMap((r) => (r.phien || []).flatMap((p) => (p.ky_han || []).map((k) => ({ ngay: r.d, luot: p.phien, loai_giao_dich: p.loai, ky_han_ngay: k.ngay, so_tham_gia: k.tham_gia, so_trung_thau: k.trung_thau, khoi_luong: k.kl, lai_suat: k.ls }))));
  t.cpi = (raw.cpi || []).map((r) => ({ thang: r.thang + "-01", cpi_yoy: r.yoy ?? null, cpi_mom: r.mom ?? null, cpi_binh_quan: r.bq ?? null, co_ban_yoy: r.co_ban_yoy ?? null, co_ban_binh_quan: r.co_ban_bq ?? null }));
  const hist = { ...(raw.history || {}) };
  if (raw.live?.date_iso) hist[raw.live.date_iso] = { banks: raw.live.banks };
  t.gia_usd_ngan_hang = Object.entries(hist).flatMap(([d, v]) => Object.entries(v.banks || {}).map(([b, x]) => ({ ngay: d, ngan_hang: b, mua_tien_mat: x.cash ?? null, mua_chuyen_khoan: x.transfer ?? null, ban: x.sell ?? null })));
  for (const k of Object.keys(t)) t[k].sort((a, b) => (a.ngay || a.thang || "").localeCompare(b.ngay || b.thang || ""));
  return t;
}

// ---------------------------------------------------------------- chỉ số
export function computeMetrics(t) {
  const c = t.ty_gia_trung_tam;
  const cmap = Object.fromEntries(c.map((r) => [r.ngay, r.ty_gia]));
  const byDay = {};
  for (const r of t.gia_usd_ngan_hang) (byDay[r.ngay] ||= []).push(r);
  const bank = Object.keys(byDay).sort().map((d) => ({ ngay: d, ban: median(byDay[d].map((x) => x.ban)), mua_ck: median(byDay[d].map((x) => x.mua_chuyen_khoan)), n: byDay[d].length }));
  // chỉ ghép cùng ngày với tỷ giá trung tâm; ngày nghỉ bỏ, không lấy phiên trước
  const band = bank.filter((b) => cmap[b.ngay] && b.ban).map((b) => { const tt = cmap[b.ngay], tran = tt * 1.05; return { ngay: b.ngay, ty_gia: tt, tran, ban: b.ban, vi_tri: (b.ban - tt) / (tran - tt) * 100, du_dia: (tran - b.ban) / b.ban * 100 }; });
  const last = c.at(-1), prev = c.at(-2);
  const year = last?.ngay.slice(0, 4);
  const yStart = c.find((r) => r.ngay >= year + "-01-01");
  const ago = (n) => { if (!last) return null; const tgt = T(last.ngay) - n * 864e5; return [...c].reverse().find((r) => T(r.ngay) <= tgt); };
  const ib = {};
  for (const r of t.lai_suat_lien_ngan_hang) (ib[r.ngay] ||= {})[r.ky_han] = r;
  const ibDays = Object.keys(ib).sort();
  const ibL = ibDays.at(-1), ibP = ibDays.at(-2);
  const onVols = ibDays.map((d) => ib[d].ON?.doanh_so).filter(Boolean);
  const tb20 = onVols.length > 1 ? onVols.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.min(20, onVols.length - 1) : null;
  const omoDays = [...new Set(t.omo.map((r) => r.ngay))].sort();
  const omoL = omoDays.at(-1);
  const omoRows = t.omo.filter((r) => r.ngay === omoL);
  const omoRate = omoRows.filter((r) => r.khoi_luong > 0 && r.lai_suat > 0).sort((a, b) => a.ky_han_ngay - b.ky_han_ngay)[0]?.lai_suat ?? null;
  const omoVol = omoRows.reduce((a, r) => a + (r.khoi_luong || 0), 0);
  const refi = t.lai_suat_dieu_hanh.find((r) => /tái cấp vốn/i.test(r.loai));
  const redis = t.lai_suat_dieu_hanh.find((r) => /tái chiết khấu/i.test(r.loai));
  const cpiL = [...t.cpi].reverse().find((r) => r.cpi_yoy != null);
  const cpiBq = [...t.cpi].reverse().find((r) => r.cpi_binh_quan != null);
  const refL = t.ty_gia_tham_khao.filter((r) => r.ngoai_te === "USD").at(-1);
  const bandL = band.at(-1);
  const bandY = band.filter((b) => b.ngay >= year + "-01-01");
  const policy = omoRate ?? refi?.gia_tri ?? null;
  return {
    cmap, bank, band, last, prev, yStart, ago, ib, ibDays, ibL, ibP, tb20, omoDays, omoL, omoRows, omoRate, omoVol, refi, redis, cpiL, cpiBq, refL, bandL,
    bandMax: bandY.reduce((a, b) => (!a || b.vi_tri > a.vi_tri ? b : a), null),
    bandMin: bandY.reduce((a, b) => (!a || b.vi_tri < a.vi_tri ? b : a), null),
    ytd: last && yStart ? (last.ty_gia / yStart.ty_gia - 1) * 100 : null,
    dDay: last && prev ? last.ty_gia - prev.ty_gia : null,
    on: ibL ? ib[ibL].ON?.lai_suat : null,
    onPrev: ibP ? ib[ibP].ON?.lai_suat : null,
    onVol: ibL ? ib[ibL].ON?.doanh_so : null,
    spread: ibL && omoRate != null && ib[ibL].ON ? ib[ibL].ON.lai_suat - omoRate : null,
    real: policy != null && cpiL ? policy - cpiL.cpi_yoy : null,
    policy,
  };
}

// ---------------------------------------------------------------- tín hiệu rủi ro
export function signals(M, raw, today = todayVN()) {
  const s = [];
  const b = M.bandL;
  if (b) {
    if (b.vi_tri >= 80) s.push({ muc: "bad", nhom: "Tỷ giá", ten: "USD sát trần biên độ", chi_tiet: `Giá bán USD trung vị ${N(b.ban)} đ đã dùng ${N(b.vi_tri, 0)}% biên độ trên.`, cau_hoi: "Kế hoạch phòng ngừa (kỳ hạn, hoán đổi) cho khoản phải trả USD 3–6 tháng tới là gì và đã được duyệt chưa?" });
    else if (b.vi_tri >= 50) s.push({ muc: "warn", nhom: "Tỷ giá", ten: "Áp lực tỷ giá đáng chú ý", chi_tiet: `Giá bán USD đã dùng ${N(b.vi_tri, 0)}% biên độ trên.`, cau_hoi: "Tỷ lệ phòng ngừa hiện tại cho các khoản phải trả USD là bao nhiêu?" });
    else s.push({ muc: "ok", nhom: "Tỷ giá", ten: "Áp lực tỷ giá thấp", chi_tiet: `Giá bán USD mới dùng ${N(b.vi_tri, 0)}% biên độ trên, còn ${N(b.du_dia, 1)}% đến trần${M.refL ? `; NHNN mua vào ở ${N(M.refL.mua)} đ` : ""}.`, cau_hoi: "Công ty đang tận dụng giai đoạn tỷ giá êm để thanh toán bông nhập khẩu, trả nợ vay USD sớm, hay vẫn để trạng thái mở? Ai phê duyệt?" });
  }
  if (M.spread != null) {
    if (M.spread > 0.5) s.push({ muc: "warn", nhom: "Thanh khoản", ten: "Lãi suất qua đêm cao hơn OMO rõ", chi_tiet: `Qua đêm ${N(M.on, 2)}% so với OMO ${N(M.omoRate, 2)}% (chênh ${S(M.spread, 2)} điểm).`, cau_hoi: "Hạn mức và lãi suất vay ngắn hạn cho mùa cao điểm cuối năm, Tết đã được chốt bằng văn bản chưa?" });
    else s.push({ muc: "ok", nhom: "Thanh khoản", ten: "Thanh khoản hệ thống không căng", chi_tiet: `Qua đêm ${N(M.on, 2)}%, chênh ${S(M.spread, 2)} điểm so với OMO.`, cau_hoi: "Ban điều hành đã đề nghị ngân hàng giảm lãi suất các khoản vay hiện hữu chưa, kết quả thế nào?" });
  }
  if (M.onVol && M.tb20 && M.onVol > M.tb20 * 1.3) s.push({ muc: "warn", nhom: "Thanh khoản", ten: "Doanh số qua đêm tăng vọt", chi_tiet: `Cao hơn ${N((M.onVol / M.tb20 - 1) * 100, 0)}% so với trung bình 20 phiên.`, cau_hoi: "Ngân hàng giao dịch có báo trước khả năng siết giải ngân không?" });
  if (M.real != null && M.real < 0) s.push({ muc: "warn", nhom: "Lãi suất", ten: "Lãi suất thực âm", chi_tiet: `Lãi suất điều hành ${N(M.policy, 2)}% thấp hơn CPI ${N(M.cpiL.cpi_yoy, 2)}% (${S(M.real, 2)} điểm).`, cau_hoi: "Kế hoạch tài chính năm tới có giả định chi phí vay giảm không? Lãi suất tăng 2 điểm thì lợi nhuận còn bao nhiêu?" });
  if (M.cpiBq && M.cpiBq.cpi_binh_quan > 4.5) s.push({ muc: "warn", nhom: "Chi phí", ten: "Lạm phát bình quân vượt mục tiêu", chi_tiet: `CPI bình quân ${N(M.cpiBq.cpi_binh_quan, 2)}% so với mục tiêu 4,5%.`, cau_hoi: "Kế hoạch năm tới dự phòng bao nhiêu cho tăng lương, điện và vận chuyển?" });
  const h = raw?.health?.sources || {};
  for (const v of Object.values(h)) if (v.trang_thai === "loi") s.push({ muc: "bad", nhom: "Dữ liệu", ten: `Nguồn ${v.ten} đang lỗi`, chi_tiet: v.loi || "", cau_hoi: null });
  if (M.ibL && days(M.ibL, today) > 5) s.push({ muc: "warn", nhom: "Dữ liệu", ten: "Số liệu liên ngân hàng trễ", chi_tiet: `Phiên mới nhất ${DMY(M.ibL)}, trễ ${days(M.ibL, today)} ngày.`, cau_hoi: "Quyết định vốn ngắn hạn đang dựa vào nguồn nào khác?" });
  return s;
}

// ---------------------------------------------------------------- bản tóm tắt gọn cho API và cho AI
export function summary(M, raw) {
  const ibRow = M.ibL ? M.ib[M.ibL] : {};
  return {
    ty_gia_trung_tam: M.last ? { ngay: M.last.ngay, gia_tri: M.last.ty_gia, so_voi_phien_truoc: M.dDay, tu_dau_nam_pct: round(M.ytd, 3), tran_bien_do: round(M.last.ty_gia * 1.05, 0), san_bien_do: round(M.last.ty_gia * 0.95, 0) } : null,
    ap_luc_ty_gia: M.bandL ? { ngay: M.bandL.ngay, gia_ban_usd_trung_vi: M.bandL.ban, vi_tri_trong_bien_do_pct: round(M.bandL.vi_tri, 1), du_dia_den_tran_pct: round(M.bandL.du_dia, 2), cao_nhat_nam: M.bandMax && { ngay: M.bandMax.ngay, vi_tri_pct: round(M.bandMax.vi_tri, 1) }, thap_nhat_nam: M.bandMin && { ngay: M.bandMin.ngay, vi_tri_pct: round(M.bandMin.vi_tri, 1) } } : null,
    ty_gia_tham_khao_usd: M.refL ? { ngay: M.refL.ngay, mua: M.refL.mua, ban: M.refL.ban } : null,
    lien_ngan_hang: M.ibL ? { ngay: M.ibL, lai_suat: Object.fromEntries(Object.entries(ibRow).map(([k, v]) => [k, v.lai_suat])), doanh_so_qua_dem_ty: M.onVol, doanh_so_qua_dem_tb20_ty: round(M.tb20, 0) } : null,
    omo: M.omoL ? { ngay: M.omoL, lai_suat_ky_ngan_nhat: M.omoRate, khoi_luong_ty: M.omoVol } : null,
    chenh_qua_dem_omo_diem: round(M.spread, 2),
    lai_suat_dieu_hanh: { tai_cap_von: M.refi?.gia_tri ?? null, tai_chiet_khau: M.redis?.gia_tri ?? null, dung_tinh_lai_suat_thuc: M.policy },
    cpi: M.cpiL ? { thang: M.cpiL.thang.slice(0, 7), yoy: M.cpiL.cpi_yoy, binh_quan: M.cpiBq?.cpi_binh_quan ?? null, co_ban_yoy: M.cpiL.co_ban_yoy } : null,
    lai_suat_thuc_diem: round(M.real, 2),
    nguon_cap_nhat: raw?.health?.lan_chay || null,
  };
}

// ---------------------------------------------------------------- tiện ích bảng cho API / xuất CSV
export function filterRows(rows, { tu, den, ...eq } = {}) {
  const key = rows[0] && ("ngay" in rows[0] ? "ngay" : "thang" in rows[0] ? "thang" : null);
  return rows.filter((r) => (!key || ((!tu || r[key] >= tu) && (!den || r[key] <= den + "￿"))) &&
    Object.entries(eq).every(([k, v]) => v == null || v === "" || String(r[k] ?? "").toLowerCase() === String(v).toLowerCase()));
}

export function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const q = (v) => v == null ? "" : typeof v === "number" ? String(v) : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\r\n");
}
