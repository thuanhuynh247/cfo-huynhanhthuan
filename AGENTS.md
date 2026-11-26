# AGENTS.md – CFO Terminal (cfo.huynhanhthuan.com)

Điểm vào cho mọi trợ lý lập trình (Claude Code, Codex, Cursor, Kiro…).

## Đọc skill nào

| Việc | Skill |
|---|---|
| Thêm lệnh, sửa giao diện, thêm/sửa khái niệm và chỉ số, kiểm thử, triển khai | [`skills/cfo-terminal/`](./skills/cfo-terminal/SKILL.md) |
| Thiết kế khái niệm, quan hệ, chỉ số, đơn vị, độ hạt; xác nhận và phát hành | [`skills/nvidia-ontology-management/`](./skills/nvidia-ontology-management/SKILL.md) → `references/modeling.md`, `references/publication.md` |
| Kiểm câu trả lời: ý định, SQL, dòng dữ liệu, cắt bớt, lời văn | [`skills/nvidia-ontology-query/`](./skills/nvidia-ontology-query/SKILL.md) → `references/query-validation.md` |
| Dựng NVIDIA Auto Ontology thật (Docker/Helm) để nhập `ontology/cfo.ossie.yaml` | [`skills/nvidia-ontology-setup/`](./skills/nvidia-ontology-setup/SKILL.md) |

Ba skill `nvidia-ontology-*` chép nguyên bản từ https://github.com/NVIDIA/auto-ontology (Apache-2.0,
commit ghi trong `skills/NVIDIA_SOURCE_COMMIT`), kèm chữ ký `skill.oms.sig`: **không sửa** các tệp đó;
điều chỉnh cho dự án này viết ở `skills/cfo-terminal/`. `.claude/skills/` là bản sao để Claude Code tự nạp.

## Sáu câu hỏi mọi con số phải trả lời được

Nghĩa là gì · Nằm ở đâu · Nối với gì · Tính thế nào · Từ đâu ra · Có dùng được không.
Tất cả nằm trong `ontology/build_ontology.py`. Không sửa tay `assets/ontology.json` hay `ontology/cfo.ossie.yaml`.

## Cổng kiểm trước khi commit

```bash
python ontology/build_ontology.py      # sinh lại ontology
python scripts/validate_ontology.py    # mọi chỉ số chạy được trên số liệu thật (data/)
npm test                               # bộ cào Node = bản Python trên mẫu NHNN thật; máy chủ; API; AI giả
python scripts/smoke_test.py           # trình duyệt thật, desktop + điện thoại, AI giả (cần npm run vendor)
```
Workflow `build-win.yml` build .exe trên Windows và mở thử bản build trước khi phát hành.

## Kiến trúc nhanh

| Phần | Tệp |
|---|---|
| Vỏ Windows | `electron/main.mjs`, `electron/preload.cjs`, `electron-builder.yml` |
| Máy chủ cục bộ | `server/index.mjs` (127.0.0.1:47240) |
| Kết nối AI | `server/drivers.mjs`, `server/env-path.mjs` (lấy từ MedSlide VI Studio; sửa thì giữ tương thích) |
| Bộ cào trên máy | `server/crawler.mjs` (bản Node của `crawler/sbv.py`, `crawler/ngan_hang.py`) |
| Lõi tính toán | `lib/core.js`, `lib/api-v1.js` |
| Giao diện | `index.html`, `assets/app.js`, `assets/style.css` |
| Trang tải | `web/` |

## Dữ liệu

`data/` do bot ghi (workflow `cap-nhat-du-lieu.yml`, mỗi đêm) và được đóng gói vào bản cài. Không sửa tay.
NHNN chặn khi gọi dồn dập: không giảm giãn cách dưới 20 giây, không tăng quá 4 lần gọi mỗi lượt.
Đổi bộ đọc trong `crawler/sbv.py` thì đổi tương ứng trong `server/crawler.mjs` và cập nhật `test/fixtures/sbv/expected.json`.
