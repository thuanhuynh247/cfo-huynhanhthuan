const c = window.SITE_CONFIG || {};
for (const a of document.querySelectorAll("[data-dl]")) a.href = a.dataset.dl === "portable" ? c.PORTABLE_URL : c.SETUP_URL;
for (const s of document.querySelectorAll("[data-ver]")) s.textContent = c.VERSION || "";
