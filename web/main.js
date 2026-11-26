const c = window.SITE_CONFIG || {};
for (const a of document.querySelectorAll("[data-dl]")) a.href = a.dataset.dl === "portable" ? c.PORTABLE_URL : c.SETUP_URL;
for (const s of document.querySelectorAll("[data-ver]")) s.textContent = c.VERSION || "";
// Mời cà phê: đổi mã QR theo số tiền, chép số tài khoản / nội dung
const qr = document.getElementById("qr-img");
for (const r of document.querySelectorAll('input[name="amount"]')) r.addEventListener("change", () => { if (qr) qr.src = `/assets/img/vietqr-${r.value}.png`; });
for (const b of document.querySelectorAll("[data-copy]")) b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); const o = b.textContent; b.textContent = "Đã chép"; setTimeout(() => (b.textContent = o), 1500); } catch { /* trình duyệt chặn */ }
});
