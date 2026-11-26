# CFO Terminal · cfo.huynhanhthuan.com

Không gian làm việc cho Giám đốc tài chính đọc nhanh tình hình tiền tệ: tỷ giá trung tâm,
áp lực tỷ giá trong biên độ ±5%, giá USD 16 ngân hàng, lãi suất liên ngân hàng, OMO, CPI – và
tác động lên chính doanh nghiệp. Điều khiển bằng dòng lệnh hoặc hỏi AI bằng tiếng Việt.

Dự án **tự chủ**: tự cào số liệu (GitHub Actions), tự lưu trong kho (`data/`), tự phục vụ trang và
**API riêng** (`/api/v1/*` trên Vercel). Trang chỉ gọi API và tệp của chính nó.

Mọi câu trả lời của AI đi theo cách làm của **NVIDIA Auto Ontology**: tra khái niệm trong ontology →
chạy SQL trên số liệu → trả lời kèm **SQL, các bước và nguồn** để người đọc tự kiểm.

## Dùng

Gõ lệnh hoặc hỏi thẳng bằng tiếng Việt. `Tab` gợi ý, `↑ ↓` lệnh trước, `/` nhảy vào ô lệnh.
Trên điện thoại bấm các chip phía trên ô lệnh. Mỗi lệnh có đường dẫn riêng để gửi người khác,
ví dụ `cfo.huynhanhthuan.com/#lenh=biendo`.

| Nhóm | Lệnh |
|---|---|
| Phân tích | `tongquan` · `tygia [90\|ytd\|1y\|all]` · `biendo` · `nganhang` · `laisuat` · `thanhkhoan` · `omo` · `cpi` · `thamkhao` |
| Doanh nghiệp | `tacdong ar= ap= lusd= cash= lvnd= rev=` · `kichban usd=3 ls=2` · `canhbao` · `cauhoi` · `baocao` |
| AI & dữ liệu | `hoi <câu hỏi>` · `kiemtra <câu hỏi>` · `thuatngu` · `dinhnghia <khái niệm>` · `sql <SELECT…>` · `bang` · `xuat <bảng>` · `api [bảng]` |
| Hệ thống | `nguon` · `ai` · `lammoi` · `lichsu` · `giaodien` · `xoa` · `trogiup` |

## API (chỉ đọc, không cần khoá)

| Địa chỉ | Trả về |
|---|---|
| `GET /api/v1` | Danh mục API |
| `GET /api/v1/tong-quan` | Chỉ số chính hôm nay + tín hiệu rủi ro |
| `GET /api/v1/bang` | 7 bảng: cột, số dòng, ngày mới nhất |
| `GET /api/v1/bang/{ten}` | Dữ liệu một bảng. `tu=`, `den=` (YYYY-MM-DD), `gioi_han=`, `dinh_dang=csv`, lọc theo cột (`ngoai_te=USD`, `ky_han=ON`, `ngan_hang=Vietcombank`) |
| `GET /api/v1/suc-khoe` | Lần cào gần nhất, trạng thái từng nguồn |
| `GET /api/v1/ontology` | Khái niệm, chỉ số, công thức SQL, nguồn gốc |
| `POST /api/v1/ai` | Chuyển tiếp tới Anthropic cho lệnh `hoi` (cần mã truy cập) |

**Excel tự cập nhật:** Data → From Web → `https://cfo.huynhanhthuan.com/api/v1/bang/ty_gia_trung_tam?dinh_dang=csv` → Load → Refresh All.
**Power BI:** Get data → Web, cùng địa chỉ. **Google Sheets:** `=IMPORTDATA("…?dinh_dang=csv")`.
Bảng: `ty_gia_trung_tam`, `ty_gia_tham_khao`, `lai_suat_lien_ngan_hang`, `lai_suat_dieu_hanh`, `omo`, `cpi`, `gia_usd_ngan_hang`.

## Kiến trúc

```
crawler/sbv.py             cào NHNN (API ẩn headless-delivery + HTML OMO, CPI), chống bị chặn
crawler/ngan_hang.py       giá USD: bảng 16 ngân hàng + cào thẳng Vietcombank, ACB, MSB
.github/workflows/         cap-nhat-du-lieu.yml: mỗi giờ 8:15–17:15 thứ 2–6 và 23:15 hằng ngày
data/nhnn, data/ngan-hang  số liệu JSON (bot commit khi có số mới, có cổng kiểm mất dòng)
lib/core.js                dựng bảng, chỉ số, tín hiệu – dùng chung cho trang và API
lib/server.js, api/v1/     API trên Vercel
index.html, assets/        giao diện tĩnh (không build), phông tự lưu trữ, biểu đồ SVG tự vẽ
assets/ontology.json       ontology cho trình duyệt   ┐ sinh từ ontology/build_ontology.py
ontology/cfo.ossie.yaml    ontology chuẩn Apache Ossie ┘ (nhập được vào NVIDIA Auto Ontology)
skills/                    3 skill NVIDIA Auto Ontology (nguyên bản) + skill cfo-terminal
scripts/                   validate_ontology.py, test_api.mjs, smoke_test.py, kiem_du_lieu.py
```

SQL chạy ngay trong trình duyệt bằng DuckDB-WASM, chỉ nạp khi gõ `sql` hoặc `hoi`.

## Cài đặt (một lần)

1. **Vercel** → Add New… → Project → Import `thuanhuynh247/cfo-huynhanhthuan` (kho riêng tư vẫn được,
   Vercel xin quyền đọc kho) → Framework Preset: **Other**, Build Command để trống → Deploy.
2. **Settings → Environment Variables**:
   - `ANTHROPIC_API_KEY` – khoá Anthropic (để lệnh `hoi` chạy qua máy chủ)
   - `CFO_ACCESS_CODE` – mã truy cập; người dùng gõ `ai ma <mã>` một lần trên mỗi máy
   - `CFO_MODEL` (tuỳ chọn, mặc định `claude-sonnet-5-5`), `CFO_MAX_TOKENS` (tuỳ chọn, mặc định 2000)
3. **Settings → Domains → Add** `cfo.huynhanhthuan.com`. Ở nơi quản lý DNS của `huynhanhthuan.com`:
   `CNAME  cfo  →  cname.vercel-dns.com`. Vercel tự cấp HTTPS.
4. **Deploy Hook** (để số mới của bot chắc chắn lên trang): Vercel → Settings → Git → Deploy Hooks →
   tên `bot`, nhánh `main` → Create → chép địa chỉ. GitHub → kho → Settings → Secrets and variables →
   Actions → New repository secret: `VERCEL_DEPLOY_HOOK` = địa chỉ vừa chép.
5. **GitHub → Actions → Cập nhật số liệu → Run workflow** để chạy lượt đầu; sau đó tự chạy theo lịch.

Không có máy chủ AI, mọi lệnh phân tích và API vẫn chạy; riêng `hoi` chuyển sang bộ định tuyến từ khoá,
hoặc gọi thẳng Anthropic bằng khoá riêng (`ai key sk-ant-…`, chỉ nên dùng trên máy cá nhân).

**Chi phí:** kho riêng tư dùng phút GitHub Actions (gói Free: 2.000 phút/tháng). Lịch hiện tại ≈ 11 lượt/ngày
làm việc × 1–3 phút ≈ 400–800 phút/tháng. Vercel Hobby đủ dùng (mỗi lần có số mới là một lần deploy tĩnh).

## Phát triển

```bash
python ontology/build_ontology.py                        # sinh lại ontology sau khi sửa khái niệm/chỉ số
pip install duckdb && python scripts/validate_ontology.py  # kiểm mọi chỉ số trên data/
node scripts/test_api.mjs                                # thử API trên data/
pip install playwright && playwright install chromium && python scripts/smoke_test.py
npx vercel dev                                           # chạy cả trang lẫn API ở http://localhost:3000
```

Quy trình đầy đủ cho trợ lý lập trình: [AGENTS.md](./AGENTS.md).

## Giới hạn

- OMO chỉ có từ 26/11/2026 vì NHNN chỉ hiện phiên mới nhất; bộ cào tích luỹ dần từng ngày.
- Lịch sử giá ngân hàng trước tháng 11/2026 có ngày được ngoại suy: coi biểu đồ áp lực tỷ giá giai đoạn đó là ước lượng.
- Nếu kho `vcb-exchange-rate` ngừng cập nhật, bảng giá ngân hàng chỉ còn 3 ngân hàng cào thẳng (Vietcombank, ACB, MSB).
- Các chỉ số trong ontology đang ở trạng thái **nháp** hoặc **đã đối chiếu nguồn**; chỉ CFO chuyển sang **đã xác nhận**.
- Đây là công cụ phân tích, không phải khuyến nghị giao dịch.
