# CFO Terminal · cfo.huynhanhthuan.com

App Windows cho Giám đốc tài chính đọc nhanh tình hình tiền tệ: tỷ giá trung tâm, áp lực tỷ giá trong
biên độ ±5%, giá USD 16 ngân hàng, lãi suất liên ngân hàng, OMO, CPI – và tác động lên chính doanh nghiệp.
Điều khiển bằng dòng lệnh hoặc hỏi AI bằng tiếng Việt.

**Mỗi CFO tự cài, tự kết nối:** app tự cào số liệu ngay trên máy người dùng, AI chạy bằng tài khoản của
chính họ (Claude Code, ChatGPT/Codex, Gemini, Ollama, khoá API). Không có máy chủ, không có khoá dùng chung.
Cách đóng gói và kết nối AI giống [MedSlide VI Studio](https://slide.huynhanhthuan.com).

Mọi câu trả lời của AI đi theo cách làm của **NVIDIA Auto Ontology**: tra khái niệm trong ontology →
chạy SQL trên số liệu → trả lời kèm **SQL, các bước và nguồn** để người đọc tự kiểm.

## Dùng

Tải `CFO-Terminal-Setup-x64.exe` (hoặc bản Portable) ở trang Releases hoặc cfo.huynhanhthuan.com, cài, mở.
Gõ lệnh hoặc hỏi thẳng. `Tab` gợi ý, `↑ ↓` lệnh trước, `/` nhảy vào ô lệnh.

| Nhóm | Lệnh |
|---|---|
| Phân tích | `tongquan` · `tygia [90\|ytd\|1y\|all]` · `biendo` · `nganhang` · `laisuat` · `thanhkhoan` · `omo` · `cpi` · `thamkhao` |
| Doanh nghiệp | `tacdong ar= ap= lusd= cash= lvnd= rev=` · `kichban usd=3 ls=2` · `canhbao` · `cauhoi` · `baocao` |
| AI & dữ liệu | `hoi <câu hỏi>` · `kiemtra <câu hỏi>` · `thuatngu` · `dinhnghia <khái niệm>` · `sql <SELECT…>` · `bang` · `xuat <bảng>` · `api [bảng]` |
| Hệ thống | `ai` (kết nối AI) · `capnhat` (cào ngay) · `nguon` · `lammoi` · `lichsu` · `giaodien` · `xoa` · `trogiup` |

## Kết nối AI (lệnh `ai`)

Dùng lại lõi kết nối của MedSlide VI Studio (`server/drivers.mjs`, `server/env-path.mjs`): app dò CLI đã cài,
cài giúp bằng một nút, mở cửa sổ đăng nhập OAuth, lưu khoá API trong `%APPDATA%\CFO Terminal\config.json`.

| Loại | Nền tảng |
|---|---|
| Đăng nhập tài khoản | Claude Code (Claude Pro/Max), OpenAI Codex (ChatGPT Plus/Pro), Gemini CLI (Google), Antigravity, Muse, OpenCode, Copilot, Qwen |
| Khoá API | Claude API (`claude-haiku-5-5` mặc định), Gemini API, OpenRouter |
| Offline | Ollama |

Mọi nền tảng chỉ cần nhận văn bản và trả văn bản: vòng `retrieve → run_sql → submit` chạy theo giao thức
"mỗi lượt một hành động JSON" (`assets/app.js` → `agent()`), nên CLI nào cũng dùng được, có nền tảng dự phòng.

## Số liệu

- **Trên máy CFO** (`server/crawler.mjs`): khi mở app và mỗi giờ, gọi sbv.gov.vn tối đa 4 lần, giãn cách 20 giây
  (NHNN chặn khi gọi dồn dập); cào thẳng Vietcombank, ACB, MSB. Nguồn dự phòng: kho công khai
  `thuanhuynh247/vcb-exchange-rate` (NHNN + bảng 16 ngân hàng). Lưu ở `%APPDATA%\CFO Terminal\data`.
- **Đóng gói sẵn trong bản cài** (`data/`): workflow `cap-nhat-du-lieu.yml` chạy bộ cào Python (`crawler/`) mỗi đêm,
  lùi dần lịch sử, nên người cài mới có ngay lịch sử từ 2009.
- Bộ đọc Node cho kết quả giống hệt bản Python trên mẫu thật của NHNN (`test/fixtures/sbv`, `npm test`).

## API cho Excel, Power BI (chạy trên máy, chỉ đọc)

Khi app mở: `http://127.0.0.1:47240/api/v1`

| Địa chỉ | Trả về |
|---|---|
| `/api/v1/tong-quan` | Chỉ số chính + tín hiệu rủi ro |
| `/api/v1/bang` | 7 bảng: cột, số dòng, ngày mới nhất |
| `/api/v1/bang/{ten}` | `tu=`, `den=`, `gioi_han=`, `dinh_dang=csv`, lọc theo cột (`ngoai_te=USD`, `ky_han=ON`) |
| `/api/v1/suc-khoe` | Lần cào gần nhất, trạng thái từng nguồn |
| `/api/v1/ontology` | Khái niệm, chỉ số, công thức SQL |

Excel: Data → From Web → `http://127.0.0.1:47240/api/v1/bang/ty_gia_trung_tam?dinh_dang=csv` → Load → Refresh All.

## Kiến trúc

```
electron/            vỏ Windows: chạy máy chủ cục bộ, mở cửa sổ, hộp thoại lưu tệp
server/index.mjs     máy chủ 127.0.0.1:47240: giao diện, /data, /api/v1, /api/ai/run, /api/engines, /api/capnhat
server/drivers.mjs   kết nối AI (từ MedSlide VI Studio) + Claude API
server/crawler.mjs   bộ cào NHNN + ngân hàng chạy trên máy CFO
lib/core.js          dựng bảng, chỉ số, tín hiệu (dùng chung cho giao diện và API)
lib/api-v1.js        API cho Excel/Power BI
index.html, assets/  giao diện dòng lệnh; DuckDB-WASM đóng gói ở assets/vendor (npm run vendor)
ontology/            build_ontology.py → assets/ontology.json + cfo.ossie.yaml (Apache Ossie)
crawler/*.py, data/  bộ cào Python chạy trên GitHub Actions, giữ số liệu đóng gói sẵn
web/                 trang tải cfo.huynhanhthuan.com (Vercel, Root Directory = web)
skills/              3 skill NVIDIA Auto Ontology (nguyên bản) + skill cfo-terminal
```

## Phát hành

1. Sửa mã, tăng `version` trong `package.json` (và tham số phiên bản trong script `build:win`, `web/config.js`).
2. Đẩy lên `main`: workflow `build-win.yml` build trên `windows-latest`, chạy `npm test`, mở thử bản .exe
   (kiểm thử khói), rồi tạo GitHub Release `v<phiên bản>` kèm `CFO-Terminal-Setup-x64.exe` và bản Portable.
3. Trang tải: Vercel → New Project → kho này → **Root Directory = `web`** → Framework **Other** → Deploy;
   Domains: `cfo.huynhanhthuan.com` (DNS: `CNAME cfo → cname.vercel-dns.com`).

Nút tải trỏ tới `releases/latest/download/...`. Kho **riêng tư** thì chỉ người có quyền vào kho tải được;
muốn ai cũng tải được, chuyển kho sang công khai (không có khoá hay bí mật nào trong mã) hoặc đặt bản cài ở nơi khác
rồi sửa `web/config.js`.

## Phát triển

```bash
npm ci                      # cài Electron, electron-builder, DuckDB-WASM
npm run vendor              # đóng gói DuckDB vào assets/vendor
npm test                    # bộ cào (so với Python), máy chủ, API, AI giả
npm run server              # chạy máy chủ cục bộ, mở http://127.0.0.1:47240
npm start                   # chạy app Electron
python scripts/validate_ontology.py   # mọi chỉ số chạy được trên data/
python scripts/smoke_test.py          # trình duyệt thật, desktop + điện thoại, AI giả
```

## Giới hạn

- OMO chỉ có từ 26/11/2026 vì NHNN chỉ hiện phiên mới nhất; app tích luỹ dần từng ngày.
- Lịch sử giá ngân hàng trước tháng 11/2026 có ngày được ngoại suy: coi biểu đồ áp lực tỷ giá giai đoạn đó là ước lượng.
- Nếu kho `vcb-exchange-rate` ngừng cập nhật, bảng giá ngân hàng chỉ còn 3 ngân hàng cào thẳng.
- App chưa ký số nên Windows SmartScreen cảnh báo lần đầu.
- Đây là công cụ phân tích, không phải khuyến nghị giao dịch.
