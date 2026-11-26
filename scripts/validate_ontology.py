#!/usr/bin/env python3
"""Kiểm mọi chỉ số trong ontology trên số liệu thật (bước Validate của Auto Ontology).

Chạy:  pip install duckdb && python scripts/validate_ontology.py
Đọc data/ của chính kho, dựng bảng giống hệt lib/core.js (buildTables) rồi chạy từng SQL trong assets/ontology.json.
Thoát mã 1 nếu có chỉ số lỗi hoặc trả 0 dòng.
"""
import json, os, sys

import duckdb

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.environ.get("CFO_DATA_DIR") or os.path.join(ROOT, "data")


def load(rel):
    with open(os.path.join(DATA, rel), encoding="utf-8") as f:
        return json.load(f)


def main():
    ont = json.load(open(os.path.join(ROOT, "assets", "ontology.json"), encoding="utf-8"))
    raw = {k: load(v) for k, v in {
        "central": "nhnn/central.json", "reference": "nhnn/reference.json", "interbank": "nhnn/interbank.json",
        "policy": "nhnn/policy.json", "omo": "nhnn/omo.json", "cpi": "nhnn/cpi.json",
        "history": "ngan-hang/rates_history.json", "live": "ngan-hang/latest_live.json"}.items()}
    hist = dict(raw["history"]); hist[raw["live"]["date_iso"]] = {"banks": raw["live"]["banks"]}
    t = {
        "ty_gia_trung_tam": [dict(ngay=r["d"], ty_gia=r["v"], so_van_ban=r.get("vb")) for r in raw["central"]],
        "ty_gia_tham_khao": [dict(ngay=r["d"], ngoai_te=k, mua=v[0], ban=v[1]) for r in raw["reference"] for k, v in r["fx"].items()],
        "lai_suat_lien_ngan_hang": [dict(ngay=r["d"], ky_han=k, lai_suat=v, doanh_so=r.get("vol", {}).get(k), ghi_chu=r.get("note", {}).get(k)) for r in raw["interbank"] for k, v in r["r"].items()],
        "lai_suat_dieu_hanh": [dict(loai=r["loai"], gia_tri=r["gia_tri"], van_ban=r["van_ban"], ap_dung=r["ap_dung"]) for r in raw["policy"]],
        "omo": [dict(ngay=r["d"], luot=p["phien"], loai_giao_dich=p["loai"], ky_han_ngay=k["ngay"], so_tham_gia=k["tham_gia"], so_trung_thau=k["trung_thau"], khoi_luong=k["kl"], lai_suat=k["ls"]) for r in raw["omo"] for p in r["phien"] for k in p["ky_han"]],
        "cpi": [dict(thang=r["thang"] + "-01", cpi_yoy=r.get("yoy"), cpi_mom=r.get("mom"), cpi_binh_quan=r.get("bq"), co_ban_yoy=r.get("co_ban_yoy"), co_ban_binh_quan=r.get("co_ban_bq")) for r in raw["cpi"]],
        "gia_usd_ngan_hang": [dict(ngay=d, ngan_hang=b, mua_tien_mat=v.get("cash"), mua_chuyen_khoan=v.get("transfer"), ban=v.get("sell")) for d, x in hist.items() for b, v in x.get("banks", {}).items()],
    }
    con = duckdb.connect()
    for ds in ont["datasets"]:
        cols = [f["name"] for f in ds["fields"]]
        con.execute(f"CREATE TABLE {ds['name']} ({', '.join(f['name'] + ' ' + f['type'] for f in ds['fields'])})")
        rows = [tuple(r.get(c) for c in cols) for r in t[ds["name"]]]
        if rows:
            con.executemany(f"INSERT INTO {ds['name']} VALUES ({', '.join('?' * len(cols))})", rows)
        print(f"bảng {ds['name']:<26} {len(rows):>6} dòng")
    bad = 0
    for m in ont["metrics"]:
        try:
            r = con.execute(m["sql"]).fetchall()
            ok = len(r) > 0 and any(v is not None for v in r[0])
            bad += not ok
            print(("OK  " if ok else "RỖNG"), m["name"], r[0] if r else "")
        except Exception as e:
            bad += 1
            print("LỖI", m["name"], e)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
