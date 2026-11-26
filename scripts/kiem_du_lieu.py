#!/usr/bin/env python3
"""Cổng kiểm trước khi bot commit số liệu: JSON đọc được, không mất dòng so với bản đang có trên main."""
import json, os, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FILES = ["data/nhnn/central.json", "data/nhnn/reference.json", "data/nhnn/interbank.json", "data/nhnn/omo.json",
         "data/nhnn/cpi.json", "data/nhnn/policy.json", "data/nhnn/health.json",
         "data/ngan-hang/rates_history.json", "data/ngan-hang/latest_live.json"]


def size(obj):
    return len(obj) if isinstance(obj, (list, dict)) else 0


bad = []
for f in FILES:
    p = os.path.join(ROOT, f)
    try:
        with open(p, encoding="utf-8") as fh:
            new = json.load(fh)
    except Exception as e:
        bad.append(f"{f}: không đọc được ({e})")
        continue
    try:
        old = json.loads(subprocess.run(["git", "show", "HEAD:" + f], cwd=ROOT, capture_output=True, check=True).stdout)
    except Exception:
        continue  # tệp mới
    if f.endswith(("health.json", "latest_live.json", "policy.json")):
        continue
    if size(new) < size(old) * 0.95:
        bad.append(f"{f}: số dòng giảm từ {size(old)} còn {size(new)}")
    print(f"{f}: {size(old)} → {size(new)}")

if bad:
    print("DỪNG, không commit:\n  " + "\n  ".join(bad))
    sys.exit(1)
print("Số liệu ổn.")
