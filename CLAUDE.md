# CLAUDE.md

Đọc [AGENTS.md](./AGENTS.md) trước. Trả lời người dùng bằng tiếng Việt.

- App Windows (Electron) theo mẫu MedSlide VI Studio: `electron/` → `server/index.mjs` (127.0.0.1:47240) → giao diện `index.html` + `assets/app.js`.
- Không có máy chủ trên mạng, không có khoá dùng chung. AI chạy bằng tài khoản/khoá của người dùng qua `server/drivers.mjs`; khoá chỉ nằm trong `%APPDATA%\CFO Terminal\config.json`. Không bao giờ đưa khoá vào mã.
- Số liệu: `server/crawler.mjs` cào trên máy người dùng (tối đa 4 lần gọi NHNN mỗi lượt, giãn cách 20 giây). `data/` là bộ đóng gói sẵn do bot ghi; không sửa tay.
- Tính toán ở `lib/core.js`, dùng chung cho giao diện và API `/api/v1`. Không gõ cứng số liệu. Biểu đồ là SVG tự vẽ; không thêm framework.
- Giao diện: bàn phím trước, chạm được ở 360px, tương phản ≥ 4.5:1, tôn trọng `prefers-reduced-motion`.
- Commit nhỏ, thông điệp tiếng Việt, chạy các cổng kiểm trong AGENTS.md trước khi đẩy.
