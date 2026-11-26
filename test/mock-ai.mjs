// AI giả cho kiểm thử: đóng vai một CLI trả lời theo giao thức hành động JSON của CFO Terminal
export default async function mock(prompt) {
  const n = (prompt.match(/KẾT QUẢ CÔNG CỤ/g) || []).length;
  const wrap = (o) => "Kết quả:\n```json\n" + JSON.stringify(o) + "\n```";
  if (!/HÀNH ĐỘNG/.test(prompt)) return '{"ok":"Xin chào"}';
  if (n === 0) return wrap({ action: "retrieve", query: "lãi suất qua đêm" });
  if (n === 1) return wrap({ action: "run_sql", sql: "SELECT ngay, lai_suat FROM lai_suat_lien_ngan_hang WHERE ky_han = 'ON' ORDER BY ngay DESC LIMIT 3" });
  return wrap({ action: "submit", answer: "Lãi suất qua đêm phiên gần nhất lấy từ bảng liên ngân hàng (AI giả).", sql: "SELECT ngay, lai_suat FROM lai_suat_lien_ngan_hang WHERE ky_han = 'ON' ORDER BY ngay DESC LIMIT 3", steps: ["Tra khái niệm", "Chạy SQL"], answerable: true });
}
