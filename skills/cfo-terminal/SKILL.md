---
name: cfo-terminal
description: >-
  Bảo trì và mở rộng CFO Terminal (cfo.huynhanhthuan.com): thêm lệnh phân tích,
  thêm hoặc sửa khái niệm và chỉ số trong ontology tiền tệ, kiểm SQL của chỉ số
  trên số liệu thật, xác nhận định nghĩa, build và phát hành app Windows. Dùng cho mọi việc
  trong kho này, kể cả khi người dùng không nhắc tên skill.
license: Apache-2.0
metadata:
  version: "0.3.0"
  author: "Huỳnh Anh Thuận"
  tags: [cfo, ontology, nhnn, cli, duckdb]
---

# CFO Terminal

## Mục đích

Giữ cho mọi con số CFO Terminal đưa ra đều có nghĩa rõ, công thức rõ, nguồn rõ và
trạng thái xác nhận rõ – theo cách làm của NVIDIA Auto Ontology (xem
`skills/nvidia-ontology-management/references/modeling.md`).

## Kiến trúc

| Phần | Tệp | Ghi chú |
|---|---|---|
| App Windows | `electron/`, `electron-builder.yml` | Giống MedSlide VI Studio; bộ cài NSIS + Portable |
| Máy chủ cục bộ | `server/index.mjs` | 127.0.0.1:47240: giao diện, `/data`, `/api/v1`, `/api/ai/run`, `/api/engines`, `/api/capnhat` |
| Kết nối AI | `server/drivers.mjs` | Claude Code, Codex, Gemini, Ollama, Claude API, Gemini API, OpenRouter… |
| Vòng AI | `assets/app.js` → `agent()` | Giao thức một hành động JSON mỗi lượt: `retrieve`, `run_sql`, `submit` |
| Bộ cào | `server/crawler.mjs` (trên máy), `crawler/*.py` (GitHub Actions, giữ `data/`) | Hai bản phải cho cùng kết quả |
| Lõi tính toán | `lib/core.js`, `lib/api-v1.js` | Dùng chung cho giao diện và API |
| Ontology | `ontology/build_ontology.py` | Sinh `ontology/cfo.ossie.yaml` và `assets/ontology.json` |
| SQL | DuckDB-WASM đóng gói ở `assets/vendor/duckdb` (`npm run vendor`) | Chạy offline |

## Quy trình khi đổi nghĩa hoặc thêm chỉ số

1. Ghi câu hỏi nghiệp vụ mà chỉ số phải trả lời, độ hạt (ngày/tháng), đơn vị, mẫu số.
2. Sửa `ontology/build_ontology.py`: thêm vào `METRICS` (SQL DuckDB) và/hoặc `TERMS`
   (tên, đồng nghĩa, bảng, cột, bộ lọc). Trạng thái mới luôn là `"nhap"`.
3. Chạy `python ontology/build_ontology.py`.
4. Chạy `python scripts/validate_ontology.py` – mọi chỉ số phải chạy được trên số liệu thật,
   không được trả 0 dòng ngoài ý muốn. Kiểm phản ví dụ: ngày nghỉ, ghép theo ngày gây nhân dòng
   (OMO nhiều kỳ hạn mỗi ngày), kỳ hạn liên ngân hàng có dấu (*) tham chiếu ngày khác.
5. Nếu chỉ số dùng trong lệnh có sẵn (`tongquan`, `biendo`…), sửa `computeMetrics()` trong
   `lib/core.js` cho khớp đúng công thức SQL (trang và API cùng dùng hàm này). Hai nơi phải ra cùng một số.
6. Chạy `npm test` và `python scripts/smoke_test.py` (desktop và điện thoại, có AI giả lập).
7. Chỉ CFO được chuyển `status` sang `"xac_nhan"`; ghi người và ngày trong commit.

## Thêm lệnh mới

- Dùng `def(name, aliases, group, args, desc, run)` trong `assets/app.js`.
- Tên lệnh không dấu, một từ; bí danh có thể có gạch nối.
- Mỗi lệnh mở đầu bằng một câu kết luận (`class: "lead"`), rồi số liệu, rồi gợi ý lệnh tiếp (`next(...)`).
- Mọi con số phải lấy từ `D.t` / `M`; không gõ cứng số liệu.
- Màu chỉ dùng biến CSS (`--accent`, `--ok`, `--warn`, `--bad`, `--c1…c5`); kiểm cả giao diện sáng và tối.
- Chạy được ở chiều rộng 360px (bảng nằm trong `.tw` để cuộn ngang).

## API cục bộ

- Thêm điểm truy cập trong `lib/api-v1.js` (hàm thuần, nhận đường dẫn và tham số); thêm phép thử vào `test/app.test.mjs`
  và một dòng vào lệnh `api` trong `assets/app.js`.
- API chỉ đọc, chỉ nghe 127.0.0.1; máy chủ chặn mọi Origin không phải localhost.

## Quy tắc AI

- Không đưa khoá vào mã. Khoá người dùng nhập ở lệnh `ai`, lưu trong `%APPDATA%\CFO Terminal\config.json`.
- Mọi nền tảng phải chạy được bằng văn bản thuần: thêm nền tảng mới trong `server/drivers.mjs` với `detect()` và `run(prompt, model)`.
- Câu trả lời phải có SQL, các bước và nguồn; số nào không đến từ kết quả SQL thì không được viết.
- Câu hỏi về thứ không có trong dữ liệu (giá vàng, tín dụng, doanh thu công ty…) phải trả
  `answerable=false`. Danh sách nằm ở `GAPS` trong ontology.

## Xuất sang NVIDIA Auto Ontology

`ontology/cfo.ossie.yaml` là chuẩn Apache Ossie. Khi có Auto Ontology chạy thật (Docker, xem
`skills/nvidia-ontology-setup`), nhập bằng `POST /api/model/import` sau khi sao lưu theo
`skills/nvidia-ontology-management/references/publication.md`.
