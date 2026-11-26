#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Giá mua/bán USD của các ngân hàng thương mại
============================================
Hai nguồn, theo thứ tự:

1. Bảng 16 ngân hàng do kho công khai thuanhuynh247/vcb-exchange-rate cập nhật
   (docs/rates_history.json, docs/latest_live.json). Gộp vào data/ngan-hang/.
2. Cào thẳng 3 ngân hàng có API mở: Vietcombank (XML), ACB, MSB. Số cào thẳng
   ghi đè số của ngày hôm nay, nên kể cả khi nguồn 1 ngừng, CFO Terminal vẫn có
   giá USD thật mỗi ngày.

Không bao giờ xoá ngày cũ; chỉ thêm hoặc cập nhật ngày mới.
Chạy:  python crawler/ngan_hang.py
"""
import datetime as dt
import json
import os
import sys
import xml.etree.ElementTree as ET

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.environ.get("BANK_OUT") or os.path.join(ROOT, "data", "ngan-hang")
HIST = os.path.join(OUT, "rates_history.json")
LIVE = os.path.join(OUT, "latest_live.json")
UPSTREAM = os.environ.get("BANK_UPSTREAM", "https://raw.githubusercontent.com/thuanhuynh247/vcb-exchange-rate/main/docs/")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"}
VN = dt.timezone(dt.timedelta(hours=7))


def now_vn():
    return dt.datetime.now(VN)


def log(m):
    print(f"[{now_vn():%Y-%m-%d %H:%M:%S}] {m}", flush=True)


def load(p, default):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(p, obj):
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, p)


def valid(q):
    """Một báo giá USD hợp lệ: số dương, giá bán ≥ giá mua, nằm trong khoảng hợp lý."""
    try:
        s, t = float(q.get("sell") or 0), float(q.get("transfer") or q.get("cash") or 0)
    except (TypeError, ValueError, AttributeError):
        return False
    return 15000 < t <= s < 40000


# ------------------------------------------------------------ nguồn 1: kho công khai
def from_upstream():
    try:
        h = requests.get(UPSTREAM + "rates_history.json", headers=UA, timeout=30).json()
        live = requests.get(UPSTREAM + "latest_live.json", headers=UA, timeout=30).json()
        return h, live
    except Exception as e:  # mạng lỗi thì vẫn chạy phần cào thẳng
        log(f"CẢNH BÁO: không lấy được bảng 16 ngân hàng: {e}")
        return None, None


# ------------------------------------------------------------ nguồn 2: cào thẳng
def fetch_vietcombank():
    r = requests.get("https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68", headers=UA, timeout=15)
    r.raise_for_status()
    for ex in ET.fromstring(r.content).findall("Exrate"):
        if ex.get("CurrencyCode") == "USD":
            f = lambda k: float(ex.get(k).replace(",", "").strip())
            return {"cash": f("Buy"), "transfer": f("Transfer"), "sell": f("Sell")}


def fetch_acb():
    t = now_vn().strftime("%Y-%m-%dT%H:%M:%S.000")
    r = requests.get(f"https://acb.com.vn/api/front/v1/currency?currency=VND&effectiveDateTime={t}", headers=UA, timeout=15, verify=False)
    r.raise_for_status()
    q = {"cash": None, "transfer": None, "sell": None}
    for it in r.json() if isinstance(r.json(), list) else []:
        if it.get("exchangeCurrency") != "USD":
            continue
        deal, inst, den, rate = it.get("dealType"), it.get("instrumentType"), it.get("denomination"), float(it.get("exchangeRate"))
        if deal == "BID" and inst == "TRANSFER":
            q["transfer"] = rate
        elif deal == "BID" and inst == "CASH" and den == 3:
            q["cash"] = rate
        elif deal == "ASK" and den in (3, None):
            q["sell"] = rate
    return q if q["transfer"] and q["sell"] else None


def fetch_msb():
    d = now_vn().strftime("%d/%m/%Y")
    base = "https://digibank-api-business.msb.com.vn/api/corp-foreign-exchange/client-api/v1/exchange-rates/public"
    b = requests.get(base + "/board-info", params={"boardDate": d}, headers=UA, timeout=12, verify=False).json()
    if not b:
        return None
    data = requests.get(base, params={"boardDate": d, "boardNumber": b[0]["boardNumber"]}, headers=UA, timeout=12, verify=False).json()
    for c in data.get("currencyOverview", []):
        if c.get("currencyCode") == "USD" and c.get("exchangeRatesData"):
            e = c["exchangeRatesData"][0]
            buy, sell = float(str(e.get("buyRateValue", 0)).replace(",", "")), float(str(e.get("sellRateValue", 0)).replace(",", ""))
            if buy > 0 and sell > 0:
                return {"cash": buy, "transfer": buy, "sell": sell}


def main():
    os.makedirs(OUT, exist_ok=True)
    hist = load(HIST, {})
    n0 = len(hist)
    today = now_vn().date().isoformat()

    up_h, up_live = from_upstream()
    if up_h:
        for d, v in up_h.items():
            banks = {k: q for k, q in (v.get("banks") or {}).items() if valid(q)}
            if banks:
                hist.setdefault(d, {"date_dd": v.get("date_dd"), "banks": {}})["banks"].update(banks)
        log(f"Bảng 16 ngân hàng: {len(up_h)} ngày")

    direct = {}
    for name, fn in (("Vietcombank", fetch_vietcombank), ("ACB", fetch_acb), ("MSB", fetch_msb)):
        try:
            q = fn()
            if q and valid(q):
                direct[name] = q
                log(f"{name}: {q}")
            else:
                log(f"{name}: không có số hợp lệ")
        except Exception as e:
            log(f"{name}: lỗi {e}")

    if direct and now_vn().weekday() < 6:
        day = hist.setdefault(today, {"date_dd": now_vn().strftime("%d/%m/%Y"), "banks": {}})
        day["banks"].update(direct)

    if not hist:
        log("Không có số liệu nào, dừng.")
        return 1
    hist = {k: hist[k] for k in sorted(hist)}
    last = max(hist)
    live = {
        "timestamp": now_vn().isoformat(timespec="seconds"),
        "date_iso": last,
        "date_dd": hist[last].get("date_dd"),
        "banks": hist[last]["banks"],
        "cao_thang": sorted(direct),
        "nguon_bang": "vcb-exchange-rate" if up_h else None,
        "nguon_bang_luc": (up_live or {}).get("timestamp"),
    }
    old_live = load(LIVE, {})
    changed = hist != load(HIST, {})
    save(HIST, hist)
    # chỉ ghi lại latest_live khi giá đổi, để không tạo commit (và lượt deploy) vô ích
    if changed or {k: v for k, v in old_live.items() if k != "timestamp"} != {k: v for k, v in live.items() if k != "timestamp"}:
        save(LIVE, live)
    log(f"Xong: {len(hist)} ngày (trước {n0}), ngày mới nhất {last}, {len(hist[last]['banks'])} ngân hàng")
    return 0


if __name__ == "__main__":
    sys.exit(main())
