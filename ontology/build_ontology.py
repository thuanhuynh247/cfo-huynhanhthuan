#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ontology tiền tệ cho CFO Terminal – nguồn sự thật duy nhất.

Theo cách làm của NVIDIA Auto Ontology, mỗi khái niệm trả lời sáu câu hỏi:
  Nghĩa là gì (concept) · Nằm ở đâu (mapping) · Nối với gì (relationship)
  · Tính thế nào (metric) · Từ đâu ra (lineage) · Có dùng được không (certification)

Chạy:  python ontology/build_ontology.py
Sinh ra:
  ontology/cfo.ossie.yaml   – chuẩn Apache Ossie, nhập được vào Auto Ontology (POST /api/model/import)
  assets/ontology.json      – bản trình duyệt dùng cho lệnh thuatngu / dinhnghia / kiemtra / hoi

Trạng thái xác nhận:
  "nhap"        – bản nháp, chưa ai duyệt
  "doi_chieu"   – đã đối chiếu số với trang nguồn NHNN, chưa được CFO duyệt nghĩa
  "xac_nhan"    – CFO đã duyệt (sửa ở đây, ghi người và ngày, commit qua git)
"""
import json
import os

import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VERSION = "2026.11.26"
SBV_API = "https://sbv.gov.vn/o/headless-delivery/v1.0/content-structures/{}/structured-contents"
CRAWLER = "crawler/sbv.py"
BANK_CRAWLER = "crawler/ngan_hang.py"

# ------------------------------------------------------------------ bảng dữ liệu
DATASETS = [
    {
        "name": "ty_gia_trung_tam",
        "label": "Tỷ giá trung tâm VND/USD",
        "description": "Tỷ giá trung tâm NHNN công bố mỗi ngày làm việc, trước 9h ngày hiệu lực. Một dòng mỗi ngày.",
        "grain": "1 dòng / ngày hiệu lực",
        "primary_key": ["ngay"],
        "lineage": {"nguon": "NHNN – cấu trúc 137473", "url": SBV_API.format(137473), "bo_cao": CRAWLER,
                    "tep": "data/nhnn/central.json", "tu_nam": 2009},
        "fields": [
            ("ngay", "DATE", "Ngày hiệu lực (giờ Việt Nam)", True),
            ("ty_gia", "DOUBLE", "Tỷ giá trung tâm, đồng/USD", False),
            ("so_van_ban", "VARCHAR", "Số thông báo của NHNN", False),
        ],
    },
    {
        "name": "ty_gia_tham_khao",
        "label": "Tỷ giá tham khảo tại Cục Quản lý ngoại hối",
        "description": "Giá mua, bán ngoại tệ NHNN niêm yết. Giá mua USD là mức NHNN sẵn sàng mua vào; giá bán USD là mức can thiệp bán ra.",
        "grain": "1 dòng / ngày / ngoại tệ",
        "primary_key": ["ngay", "ngoai_te"],
        "lineage": {"nguon": "NHNN – cấu trúc 3450514", "url": SBV_API.format(3450514), "bo_cao": CRAWLER,
                    "tep": "data/nhnn/reference.json"},
        "fields": [
            ("ngay", "DATE", "Ngày áp dụng", True),
            ("ngoai_te", "VARCHAR", "Mã ngoại tệ: USD, EUR, JPY, GBP, CHF, AUD, CAD", False),
            ("mua", "DOUBLE", "Giá NHNN mua vào, đồng", False),
            ("ban", "DOUBLE", "Giá NHNN bán ra, đồng", False),
        ],
    },
    {
        "name": "lai_suat_lien_ngan_hang",
        "label": "Lãi suất và doanh số liên ngân hàng",
        "description": "Lãi suất bình quân và doanh số giao dịch VND giữa các tổ chức tín dụng theo kỳ hạn. NHNN công bố trễ 1–2 ngày làm việc.",
        "grain": "1 dòng / ngày giao dịch / kỳ hạn",
        "primary_key": ["ngay", "ky_han"],
        "lineage": {"nguon": "NHNN – cấu trúc 3450260", "url": SBV_API.format(3450260), "bo_cao": CRAWLER,
                    "tep": "data/nhnn/interbank.json", "tu_nam": 2014},
        "fields": [
            ("ngay", "DATE", "Ngày giao dịch", True),
            ("ky_han", "VARCHAR", "ON (qua đêm), 1W, 2W, 1M, 3M, 6M, 9M, 12M", False),
            ("lai_suat", "DOUBLE", "Lãi suất bình quân, %/năm", False),
            ("doanh_so", "DOUBLE", "Doanh số giao dịch, tỷ đồng", False),
            ("ghi_chu", "VARCHAR", "Khác rỗng khi NHNN lấy số của ngày khác để tham chiếu (dấu *)", False),
        ],
    },
    {
        "name": "lai_suat_dieu_hanh",
        "label": "Lãi suất NHNN quy định",
        "description": "Lãi suất tái cấp vốn và tái chiết khấu đang áp dụng.",
        "grain": "1 dòng / loại lãi suất",
        "primary_key": ["loai"],
        "lineage": {"nguon": "NHNN – cấu trúc 3450482", "url": SBV_API.format(3450482), "bo_cao": CRAWLER,
                    "tep": "data/nhnn/policy.json"},
        "fields": [
            ("loai", "VARCHAR", "Lãi suất tái cấp vốn | Lãi suất tái chiết khấu", False),
            ("gia_tri", "DOUBLE", "%/năm", False),
            ("van_ban", "VARCHAR", "Quyết định áp dụng", False),
            ("ap_dung", "DATE", "Ngày bắt đầu áp dụng", True),
        ],
    },
    {
        "name": "omo",
        "label": "Kết quả đấu thầu thị trường mở (OMO)",
        "description": "Kết quả từng kỳ hạn của mỗi lượt đấu thầu. Chỉ có từ ngày bộ cào bắt đầu chạy (26/11/2026) vì NHNN chỉ hiển thị phiên mới nhất.",
        "grain": "1 dòng / ngày / lượt / kỳ hạn",
        "primary_key": ["ngay", "luot", "ky_han_ngay"],
        "lineage": {"nguon": "NHNN – trang Nghiệp vụ thị trường mở (HTML)",
                    "url": "https://sbv.gov.vn/vi/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F",
                    "bo_cao": CRAWLER, "tep": "data/nhnn/omo.json"},
        "fields": [
            ("ngay", "DATE", "Ngày đấu thầu", True),
            ("luot", "INTEGER", "Lượt đấu thầu trong ngày (1, 2…)", False),
            ("loai_giao_dich", "VARCHAR", "Mua kỳ hạn (bơm tiền) hoặc loại khác NHNN ghi", False),
            ("ky_han_ngay", "INTEGER", "Kỳ hạn, ngày", False),
            ("so_tham_gia", "INTEGER", "Số thành viên tham gia", False),
            ("so_trung_thau", "INTEGER", "Số thành viên trúng thầu", False),
            ("khoi_luong", "DOUBLE", "Khối lượng trúng thầu, tỷ đồng", False),
            ("lai_suat", "DOUBLE", "Lãi suất trúng thầu, %/năm (0 khi không có giao dịch)", False),
        ],
    },
    {
        "name": "cpi",
        "label": "Chỉ số giá tiêu dùng (CPI)",
        "description": "CPI theo tháng do Cục Thống kê công bố, đọc từ tin NHNN đăng lại; tháng thiếu số so với cùng kỳ được bù bằng số Cục Thống kê đã đối chiếu.",
        "grain": "1 dòng / tháng",
        "primary_key": ["thang"],
        "lineage": {"nguon": "NHNN – trang CPI (HTML) + số Cục Thống kê đối chiếu tay",
                    "url": "https://sbv.gov.vn/vi/cpi", "bo_cao": CRAWLER, "tep": "data/nhnn/cpi.json"},
        "fields": [
            ("thang", "DATE", "Ngày đầu tháng", True),
            ("cpi_yoy", "DOUBLE", "CPI so với cùng kỳ năm trước, %", False),
            ("cpi_mom", "DOUBLE", "CPI so với tháng trước, %", False),
            ("cpi_binh_quan", "DOUBLE", "CPI bình quân từ đầu năm so với cùng kỳ, %", False),
            ("co_ban_yoy", "DOUBLE", "Lạm phát cơ bản so với cùng kỳ, %", False),
            ("co_ban_binh_quan", "DOUBLE", "Lạm phát cơ bản bình quân từ đầu năm, %", False),
        ],
    },
    {
        "name": "gia_usd_ngan_hang",
        "label": "Giá USD niêm yết tại 15 ngân hàng thương mại",
        "description": "Giá mua tiền mặt, mua chuyển khoản, bán USD của 16 ngân hàng. Lịch sử cũ có ngày được ngoại suy (xem README kho vcb-exchange-rate) nên coi là ước lượng.",
        "grain": "1 dòng / ngày / ngân hàng",
        "primary_key": ["ngay", "ngan_hang"],
        "lineage": {"nguon": "Bộ cào tỷ giá 15 ngân hàng", "url": BANK_CRAWLER, "bo_cao": BANK_CRAWLER,
                    "tep": "data/ngan-hang/rates_history.json + data/ngan-hang/latest_live.json"},
        "fields": [
            ("ngay", "DATE", "Ngày niêm yết", True),
            ("ngan_hang", "VARCHAR", "Tên ngân hàng", False),
            ("mua_tien_mat", "DOUBLE", "Giá mua tiền mặt, đồng", False),
            ("mua_chuyen_khoan", "DOUBLE", "Giá mua chuyển khoản, đồng", False),
            ("ban", "DOUBLE", "Giá bán, đồng", False),
        ],
    },
]

RELATIONSHIPS = [
    {"name": "gia_usd_ngan_hang_theo_ty_gia_trung_tam", "from": "gia_usd_ngan_hang", "to": "ty_gia_trung_tam",
     "from_columns": ["ngay"], "to_columns": ["ngay"], "cardinality": "nhiều-một",
     "note": "Ghép cùng ngày; ngày nghỉ không có tỷ giá trung tâm thì bỏ, không lấy phiên trước."},
    {"name": "ty_gia_tham_khao_theo_ty_gia_trung_tam", "from": "ty_gia_tham_khao", "to": "ty_gia_trung_tam",
     "from_columns": ["ngay"], "to_columns": ["ngay"], "cardinality": "nhiều-một",
     "note": "Lọc ngoai_te = 'USD' trước khi ghép để không nhân dòng."},
    {"name": "omo_cung_ngay_lien_ngan_hang", "from": "omo", "to": "lai_suat_lien_ngan_hang",
     "from_columns": ["ngay"], "to_columns": ["ngay"], "cardinality": "nhiều-nhiều",
     "note": "Rủi ro nhân dòng: tổng hợp OMO theo ngày và lọc ky_han = 'ON' trước khi ghép."},
]

# ------------------------------------------------------------------ chỉ số (SQL DuckDB/ANSI)
METRICS = [
    {"name": "tran_bien_do", "label": "Trần biên độ tỷ giá",
     "description": "Mức giá bán USD cao nhất ngân hàng được phép niêm yết: tỷ giá trung tâm × 1,05 (biên độ ±5%).",
     "sql": "SELECT ngay, ty_gia * 1.05 AS tran_bien_do FROM ty_gia_trung_tam",
     "unit": "đồng/USD", "grain": "ngày", "status": "doi_chieu"},
    {"name": "gia_ban_usd_trung_vi", "label": "Giá bán USD trung vị của ngân hàng",
     "description": "Trung vị giá bán USD của các ngân hàng trong ngày; dùng trung vị để loại số lạ.",
     "sql": "SELECT ngay, MEDIAN(ban) AS gia_ban_trung_vi, COUNT(*) AS so_ngan_hang FROM gia_usd_ngan_hang GROUP BY ngay",
     "unit": "đồng/USD", "grain": "ngày", "status": "nhap"},
    {"name": "vi_tri_bien_do_pct", "label": "Áp lực tỷ giá (vị trí trong biên độ trên)",
     "description": "Giá bán USD trung vị đã dùng bao nhiêu phần khoảng từ tỷ giá trung tâm đến trần. 0% = bằng trung tâm, 100% = chạm trần.",
     "sql": ("SELECT t.ngay, t.ty_gia, t.ty_gia * 1.05 AS tran, b.gia_ban_trung_vi,\n"
             "       (b.gia_ban_trung_vi - t.ty_gia) / (t.ty_gia * 0.05) * 100 AS vi_tri_pct\n"
             "FROM ty_gia_trung_tam t\n"
             "JOIN (SELECT ngay, MEDIAN(ban) AS gia_ban_trung_vi FROM gia_usd_ngan_hang GROUP BY ngay) b USING (ngay)"),
     "unit": "%", "grain": "ngày", "status": "nhap"},
    {"name": "du_dia_den_tran_pct", "label": "Dư địa giá bán USD đến trần",
     "description": "Giá bán USD trung vị còn cách trần bao nhiêu phần trăm.",
     "sql": ("SELECT t.ngay, (t.ty_gia * 1.05 - b.g) / b.g * 100 AS du_dia_pct FROM ty_gia_trung_tam t\n"
             "JOIN (SELECT ngay, MEDIAN(ban) AS g FROM gia_usd_ngan_hang GROUP BY ngay) b USING (ngay)"),
     "unit": "%", "grain": "ngày", "status": "nhap"},
    {"name": "thay_doi_ty_gia_tu_dau_nam_pct", "label": "Tỷ giá trung tâm thay đổi từ đầu năm",
     "description": "Tỷ giá trung tâm mới nhất so với phiên đầu tiên của năm.",
     "sql": ("WITH n AS (SELECT * FROM ty_gia_trung_tam WHERE year(ngay) = (SELECT year(max(ngay)) FROM ty_gia_trung_tam))\n"
             "SELECT (last(ty_gia ORDER BY ngay) / first(ty_gia ORDER BY ngay) - 1) * 100 AS thay_doi_pct FROM n"),
     "unit": "%", "grain": "năm", "status": "nhap"},
    {"name": "khoi_luong_omo_ngay", "label": "Khối lượng OMO trúng thầu trong ngày",
     "description": "Tổng khối lượng trúng thầu của mọi lượt, mọi kỳ hạn trong ngày.",
     "sql": "SELECT ngay, SUM(khoi_luong) AS khoi_luong FROM omo GROUP BY ngay",
     "unit": "tỷ đồng", "grain": "ngày", "status": "nhap"},
    {"name": "lai_suat_omo", "label": "Lãi suất OMO đại diện",
     "description": "Lãi suất trúng thầu của kỳ hạn ngắn nhất có khối lượng trong phiên gần nhất.",
     "sql": ("SELECT ngay, arg_min(lai_suat, ky_han_ngay) AS lai_suat_omo FROM omo\n"
             "WHERE khoi_luong > 0 AND lai_suat > 0 GROUP BY ngay"),
     "unit": "%/năm", "grain": "ngày", "status": "nhap"},
    {"name": "chenh_qua_dem_omo", "label": "Chênh lãi suất qua đêm so với OMO",
     "description": "Lãi suất qua đêm trừ lãi suất OMO đại diện. Dương rõ (> 0,5 điểm) = thanh khoản căng.",
     "sql": ("WITH o AS (SELECT ngay, arg_min(lai_suat, ky_han_ngay) AS omo FROM omo WHERE khoi_luong > 0 GROUP BY ngay ORDER BY ngay DESC LIMIT 1)\n"
             "SELECT l.ngay, l.lai_suat - o.omo AS chenh FROM lai_suat_lien_ngan_hang l, o\n"
             "WHERE l.ky_han = 'ON' ORDER BY l.ngay DESC LIMIT 1"),
     "unit": "điểm %", "grain": "ngày", "status": "nhap"},
    {"name": "lai_suat_thuc", "label": "Lãi suất điều hành thực",
     "description": "Lãi suất OMO đại diện (hoặc tái cấp vốn nếu chưa có OMO) trừ CPI so với cùng kỳ tháng gần nhất. Âm = dư địa hạ lãi suất hẹp.",
     "sql": ("SELECT (SELECT arg_min(lai_suat, ky_han_ngay) FROM omo WHERE ngay = (SELECT max(ngay) FROM omo) AND khoi_luong > 0)\n"
             "     - (SELECT cpi_yoy FROM cpi WHERE cpi_yoy IS NOT NULL ORDER BY thang DESC LIMIT 1) AS lai_suat_thuc"),
     "unit": "điểm %", "grain": "tháng", "status": "nhap"},
    {"name": "doanh_so_qua_dem_so_tb20", "label": "Doanh số qua đêm so với trung bình 20 phiên",
     "description": "Doanh số qua đêm phiên gần nhất chia trung bình 20 phiên trước đó. Trên 1,3 lần = nhu cầu vốn ngắn hạn tăng vọt.",
     "sql": ("WITH x AS (SELECT ngay, doanh_so, AVG(doanh_so) OVER (ORDER BY ngay ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS tb20\n"
             "           FROM lai_suat_lien_ngan_hang WHERE ky_han = 'ON')\n"
             "SELECT ngay, doanh_so / tb20 AS ty_le FROM x ORDER BY ngay DESC LIMIT 1"),
     "unit": "lần", "grain": "ngày", "status": "nhap"},
]

# ------------------------------------------------------------------ khái niệm (thuật ngữ)
TERMS = [
    {"id": "ty_gia_trung_tam", "ten": "Tỷ giá trung tâm", "dataset": "ty_gia_trung_tam", "cot": ["ty_gia"],
     "dong_nghia": ["tỷ giá TT", "central rate", "tỷ giá NHNN", "TGTT", "tỷ giá USD/VND"],
     "mo_ta": "Tỷ giá NHNN công bố hằng ngày làm gốc cho biên độ ±5%.", "status": "doi_chieu"},
    {"id": "bien_do_ty_gia", "ten": "Biên độ tỷ giá", "dataset": "ty_gia_trung_tam", "metric": "tran_bien_do",
     "dong_nghia": ["trần tỷ giá", "sàn tỷ giá", "trần biên độ", "biên độ ±5%"],
     "mo_ta": "Khoảng ±5% quanh tỷ giá trung tâm; ngân hàng không được niêm yết ngoài khoảng này.", "status": "doi_chieu"},
    {"id": "gia_ban_usd_ngan_hang", "ten": "Giá bán USD của ngân hàng", "dataset": "gia_usd_ngan_hang", "cot": ["ban"],
     "metric": "gia_ban_usd_trung_vi",
     "dong_nghia": ["giá USD ngân hàng", "tỷ giá ngân hàng thương mại", "giá bán ra", "Vietcombank", "BIDV", "giá thị trường"],
     "mo_ta": "Giá bán USD niêm yết; dùng trung vị 15 ngân hàng làm giá thị trường.", "status": "nhap"},
    {"id": "ap_luc_ty_gia", "ten": "Áp lực tỷ giá", "dataset": "ty_gia_trung_tam", "metric": "vi_tri_bien_do_pct",
     "dong_nghia": ["vị trí biên độ", "áp lực USD", "căng thẳng tỷ giá", "dư địa tỷ giá", "sát trần"],
     "mo_ta": "Giá bán USD đã dùng bao nhiêu phần biên độ trên. Trên 80% là áp lực lớn.", "status": "nhap"},
    {"id": "gia_mua_usd_nhnn", "ten": "Giá NHNN mua vào USD", "dataset": "ty_gia_tham_khao", "cot": ["mua"],
     "dong_nghia": ["tỷ giá tham khảo", "Cục quản lý ngoại hối", "NHNN mua USD", "giá can thiệp", "Sở giao dịch"],
     "mo_ta": "Mức NHNN sẵn sàng mua USD; khi NHNN mua vào là dấu hiệu dư cung ngoại tệ.", "status": "doi_chieu"},
    {"id": "lai_suat_qua_dem", "ten": "Lãi suất liên ngân hàng qua đêm", "dataset": "lai_suat_lien_ngan_hang",
     "cot": ["lai_suat"], "loc": "ky_han = 'ON'",
     "dong_nghia": ["lãi suất qua đêm", "overnight", "ON", "lãi suất liên ngân hàng"],
     "mo_ta": "Chi phí vốn một ngày giữa các ngân hàng; nhiệt kế thanh khoản hằng ngày.", "status": "doi_chieu"},
    {"id": "duong_cong_lai_suat", "ten": "Đường cong lãi suất liên ngân hàng", "dataset": "lai_suat_lien_ngan_hang",
     "cot": ["ky_han", "lai_suat"], "dong_nghia": ["kỳ hạn", "1 tuần", "1 tháng", "3 tháng", "6 tháng", "yield curve"],
     "mo_ta": "Lãi suất theo kỳ hạn trong cùng ngày.", "status": "doi_chieu"},
    {"id": "thanh_khoan_he_thong", "ten": "Thanh khoản hệ thống ngân hàng", "dataset": "lai_suat_lien_ngan_hang",
     "cot": ["doanh_so"], "metric": "doanh_so_qua_dem_so_tb20",
     "dong_nghia": ["thanh khoản", "doanh số liên ngân hàng", "thiếu vốn", "căng thanh khoản"],
     "mo_ta": "Đọc qua doanh số và lãi suất qua đêm, cùng chênh lệch với OMO.", "status": "nhap"},
    {"id": "omo", "ten": "Nghiệp vụ thị trường mở (OMO)", "dataset": "omo", "cot": ["khoi_luong", "lai_suat"],
     "metric": "khoi_luong_omo_ngay",
     "dong_nghia": ["thị trường mở", "bơm tiền", "bơm ròng", "mua kỳ hạn", "đấu thầu", "repo", "tín phiếu"],
     "mo_ta": "NHNN cho ngân hàng vay có kỳ hạn qua đấu thầu; khối lượng lớn = hỗ trợ thanh khoản.", "status": "doi_chieu"},
    {"id": "lai_suat_omo", "ten": "Lãi suất OMO", "dataset": "omo", "metric": "lai_suat_omo",
     "dong_nghia": ["lãi suất thị trường mở", "lãi suất trúng thầu", "lãi suất chính sách"],
     "mo_ta": "Lãi suất trúng thầu kỳ hạn ngắn nhất có giao dịch; dùng làm lãi suất chính sách đại diện.", "status": "nhap"},
    {"id": "chenh_qua_dem_omo", "ten": "Chênh lãi suất qua đêm – OMO", "dataset": "lai_suat_lien_ngan_hang",
     "metric": "chenh_qua_dem_omo", "dong_nghia": ["hành lang lãi suất", "chênh lệch qua đêm"],
     "mo_ta": "Cho biết thanh khoản đang căng hay dư so với mức NHNN điều hành.", "status": "nhap"},
    {"id": "lai_suat_tai_cap_von", "ten": "Lãi suất tái cấp vốn", "dataset": "lai_suat_dieu_hanh", "cot": ["gia_tri"],
     "loc": "loai = 'Lãi suất tái cấp vốn'", "dong_nghia": ["tái cấp vốn", "lãi suất điều hành", "refinancing rate"],
     "mo_ta": "Trần của hành lang lãi suất điều hành.", "status": "doi_chieu"},
    {"id": "lai_suat_tai_chiet_khau", "ten": "Lãi suất tái chiết khấu", "dataset": "lai_suat_dieu_hanh", "cot": ["gia_tri"],
     "loc": "loai = 'Lãi suất tái chiết khấu'", "dong_nghia": ["tái chiết khấu", "rediscount rate"],
     "mo_ta": "Sàn của hành lang lãi suất điều hành.", "status": "doi_chieu"},
    {"id": "cpi", "ten": "Lạm phát (CPI)", "dataset": "cpi", "cot": ["cpi_yoy", "cpi_mom", "cpi_binh_quan"],
     "dong_nghia": ["CPI", "lạm phát", "chỉ số giá tiêu dùng", "giá cả"],
     "mo_ta": "CPI so với cùng kỳ; mục tiêu kiểm soát 4,5% năm 2026.", "status": "doi_chieu"},
    {"id": "lam_phat_co_ban", "ten": "Lạm phát cơ bản", "dataset": "cpi", "cot": ["co_ban_yoy", "co_ban_binh_quan"],
     "dong_nghia": ["core inflation", "lạm phát lõi"], "mo_ta": "CPI loại trừ lương thực, năng lượng.", "status": "doi_chieu"},
    {"id": "lai_suat_thuc", "ten": "Lãi suất thực", "dataset": "cpi", "metric": "lai_suat_thuc",
     "dong_nghia": ["lãi suất thực âm", "real interest rate", "dư địa hạ lãi suất"],
     "mo_ta": "Lãi suất điều hành trừ lạm phát.", "status": "nhap"},
]

# Những thứ người dùng hay hỏi nhưng KHÔNG có trong dữ liệu – để lệnh kiemtra trả lời trung thực.
GAPS = ["giá vàng", "vàng", "chứng khoán", "VN-Index", "cổ phiếu", "tín dụng", "dư nợ", "huy động", "tiền gửi",
        "M2", "tổng phương tiện thanh toán", "cán cân thanh toán", "dự trữ ngoại hối", "giá bông", "giá sợi",
        "doanh thu", "lợi nhuận", "công nợ", "tồn kho", "lãi suất cho vay", "lãi suất huy động", "Fed", "DXY",
        "giá dầu", "xuất khẩu", "nhập khẩu", "GDP", "tỷ giá nhân dân tệ chợ đen", "tỷ giá tự do", "chợ đen"]

STATUS_LABEL = {"nhap": "Nháp – chờ CFO duyệt", "doi_chieu": "Đã đối chiếu số với trang NHNN", "xac_nhan": "CFO đã xác nhận"}


def ossie():
    def fexpr(col):
        return {"dialects": [{"dialect": "ANSI_SQL", "expression": col}]}
    return {
        "version": "0.3.0.dev0",
        "name": "cfo_tien_te_viet_nam",
        "description": "Ontology tiền tệ Việt Nam cho CFO Terminal (cfo.huynhanhthuan.com) – số liệu NHNN và 15 ngân hàng.",
        "ai_context": {"instructions": "Trả lời bằng tiếng Việt. Chỉ dùng chỉ số đã định nghĩa; nêu ngày của số liệu; "
                                       "không ghép omo với lai_suat_lien_ngan_hang khi chưa tổng hợp theo ngày."},
        "datasets": [{
            "name": d["name"], "source": d["lineage"]["url"], "primary_key": d["primary_key"],
            "description": d["description"],
            "ai_context": {"synonyms": [d["label"]] + sum([t["dong_nghia"] for t in TERMS if t["dataset"] == d["name"]], [])},
            "fields": [{"name": n, "expression": fexpr(n), "description": desc, "datatype": typ,
                        "dimension": {"is_time": is_time}} for n, typ, desc, is_time in d["fields"]],
        } for d in DATASETS],
        "relationships": [{k: r[k] for k in ("name", "from", "to", "from_columns", "to_columns")} for r in RELATIONSHIPS],
        "metrics": [{"name": m["name"], "description": f'{m["label"]}. {m["description"]} Đơn vị: {m["unit"]}.',
                     "expression": {"dialects": [{"dialect": "DUCKDB", "expression": m["sql"]}]}} for m in METRICS],
    }


def browser_json():
    return {"version": VERSION, "status_label": STATUS_LABEL, "gaps": GAPS,
            "datasets": [{**d, "fields": [{"name": n, "type": t, "mo_ta": desc, "is_time": it} for n, t, desc, it in d["fields"]]} for d in DATASETS],
            "relationships": RELATIONSHIPS, "metrics": METRICS, "terms": TERMS}


if __name__ == "__main__":
    header = ("# Sinh tự động bởi ontology/build_ontology.py – đừng sửa tay.\n"
              "# Nhập vào NVIDIA Auto Ontology: POST /api/model/import (Apache Ossie YAML).\n")
    with open(os.path.join(ROOT, "ontology", "cfo.ossie.yaml"), "w", encoding="utf-8") as f:
        f.write(header + yaml.safe_dump(ossie(), allow_unicode=True, sort_keys=False, width=110))
    with open(os.path.join(ROOT, "assets", "ontology.json"), "w", encoding="utf-8") as f:
        json.dump(browser_json(), f, ensure_ascii=False, indent=1)
    print(f"Đã sinh ontology: {len(DATASETS)} bảng, {len(TERMS)} khái niệm, {len(METRICS)} chỉ số, {len(RELATIONSHIPS)} quan hệ")
