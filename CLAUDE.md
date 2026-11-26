# CLAUDE.md

Đọc [AGENTS.md](./AGENTS.md) trước. Trả lời người dùng bằng tiếng Việt.

- Trang tĩnh, không bước build. Không thêm framework hay thư viện vẽ biểu đồ; biểu đồ là SVG tự vẽ trong `assets/app.js`.
- Mọi số liệu đọc từ `data/` của chính kho (trang: `CFG.dataBase` = `/data/`; API: `lib/server.js`). Tính toán ở `lib/core.js`, dùng chung. Không gõ cứng số liệu.
- Không đưa khoá API vào mã nguồn. Khoá ở biến môi trường Vercel (`ANTHROPIC_API_KEY`, `CFO_ACCESS_CODE`).
- Giao diện: bàn phím trước, chạm được ở 360px, tương phản ≥ 4.5:1, tôn trọng `prefers-reduced-motion`.
- Commit nhỏ, thông điệp tiếng Việt, chạy bốn cổng kiểm trong AGENTS.md trước khi đẩy.
