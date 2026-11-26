---
name: cfo-terminal
description: >-
  Bảo trì và mở rộng CFO Terminal (cfo.huynhanhthuan.com): thêm lệnh phân tích,
  thêm hoặc sửa khái niệm và chỉ số trong ontology tiền tệ, kiểm SQL của chỉ số
  trên số liệu thật, xác nhận định nghĩa, triển khai Vercel. Dùng cho mọi việc
  trong kho này, kể cả khi người dùng không nhắc tên skill.
license: Apache-2.0
metadata:
  version: "0.2.0"
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
| Giao diện dòng lệnh | `index.html`, `assets/style.css`, `assets/fonts.css`, `assets/app.js` | Tĩnh, không build; sáng mặc định, có tối |
| Lõi tính toán | `lib/core.js` | Dựng bảng, chỉ số, tín hiệu; **dùng chung** cho trang và API |
| API riêng | `api/v1/*.js` + `lib/server.js` (Vercel) | `/api/v1`, `/tong-quan`, `/bang/{ten}` (JSON/CSV), `/suc-khoe`, `/ontology`, `/ai` |
| Ontology (nguồn sự thật) | `ontology/build_ontology.py` | Sinh `ontology/cfo.ossie.yaml` và `assets/ontology.json` |
| SQL trong trình duyệt | DuckDB-WASM nạp từ jsDelivr khi gõ `sql` hoặc `hoi` | Bảng dựng đúng kiểu trong ontology |
| AI | `api/v1/ai.js` (Vercel) hoặc khoá riêng của người dùng | Vòng `retrieve → run_sql → submit` |
| Bộ cào | `crawler/sbv.py` (NHNN), `crawler/ngan_hang.py` (giá USD ngân hàng) | `.github/workflows/cap-nhat-du-lieu.yml`: mỗi giờ 8:15–17:15 thứ 2–6 + 23:15 |
| Số liệu | `data/nhnn/*.json`, `data/ngan-hang/*.json` | Bot commit khi có số mới; `scripts/kiem_du_lieu.py` chặn commit nếu mất dòng |

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
6. Chạy `node scripts/test_api.mjs` và `python scripts/smoke_test.py` (desktop và điện thoại, có AI giả lập).
7. Chỉ CFO được chuyển `status` sang `"xac_nhan"`; ghi người và ngày trong commit.

## Thêm lệnh mới

- Dùng `def(name, aliases, group, args, desc, run)` trong `assets/app.js`.
- Tên lệnh không dấu, một từ; bí danh có thể có gạch nối.
- Mỗi lệnh mở đầu bằng một câu kết luận (`class: "lead"`), rồi số liệu, rồi gợi ý lệnh tiếp (`next(...)`).
- Mọi con số phải lấy từ `D.t` / `M`; không gõ cứng số liệu.
- Màu chỉ dùng biến CSS (`--accent`, `--ok`, `--warn`, `--bad`, `--c1…c5`); kiểm cả giao diện sáng và tối.
- Chạy được ở chiều rộng 360px (bảng nằm trong `.tw` để cuộn ngang).

## API

- Thêm điểm truy cập: tạo `api/v1/<ten>.js`, dùng `load()`, `guard()`, `send()` trong `lib/server.js`;
  khai báo trong `vercel.json → functions` kèm `includeFiles` nếu đọc `data/`; thêm phép thử vào `scripts/test_api.mjs`
  và một dòng vào `api/v1/index.js` + lệnh `api` trong `assets/app.js`.
- API chỉ đọc, mở CORS. Không bao giờ ghi dữ liệu qua API. Gói Hobby của Vercel giới hạn 12 hàm.

## Quy tắc AI

- Không đưa khoá Anthropic vào mã. Máy chủ đọc `ANTHROPIC_API_KEY`; đặt `CFO_ACCESS_CODE` khi trang công khai.
- Câu trả lời phải có SQL, các bước và nguồn; số nào không đến từ kết quả SQL thì không được viết.
- Câu hỏi về thứ không có trong dữ liệu (giá vàng, tín dụng, doanh thu công ty…) phải trả
  `answerable=false`. Danh sách nằm ở `GAPS` trong ontology.

## Xuất sang NVIDIA Auto Ontology

`ontology/cfo.ossie.yaml` là chuẩn Apache Ossie. Khi có Auto Ontology chạy thật (Docker, xem
`skills/nvidia-ontology-setup`), nhập bằng `POST /api/model/import` sau khi sao lưu theo
`skills/nvidia-ontology-management/references/publication.md`.
