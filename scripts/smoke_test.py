#!/usr/bin/env python3
"""Kiểm thử khói cho CFO Terminal bằng trình duyệt thật (Playwright).

Chạy:  python scripts/smoke_test.py            # cần: pip install playwright && playwright install chromium
Tuỳ chọn biến môi trường:
  CFO_URL      trang cần thử (mặc định tự mở máy chủ tĩnh ở thư mục gốc dự án)
  CHROME       đường dẫn Chrome nếu không dùng bản của Playwright
AI giả (test/mock-ai.mjs) chạy ở máy chủ: retrieve → run_sql → submit theo giao thức hành động JSON.
Cần chạy npm run vendor trước để có DuckDB đóng gói sẵn.
"""
import asyncio, functools, http.server, json, os, re, socketserver, sys, threading

from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SHOTS = os.environ.get("SHOTS", "/tmp/cfo-shots")


def serve():
    """Chạy máy chủ cục bộ của app (node server/index.mjs) với thư mục dữ liệu tạm và AI giả."""
    import subprocess, tempfile, time, urllib.request
    env = dict(os.environ, CFO_DATA_DIR=tempfile.mkdtemp(prefix="cfo-smoke-"), CFO_NO_UPDATE="1", PORT="0",
               CFO_MOCK_AI=os.path.join(ROOT, "test", "mock-ai.mjs"))
    p = subprocess.Popen(["node", os.path.join(ROOT, "server", "index.mjs")], env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    import atexit
    atexit.register(p.terminate)
    for line in p.stdout:
        if line.startswith("CFO_LISTENING="):
            return line.split("=", 1)[1].strip() + "/"
    raise RuntimeError("máy chủ không khởi động")


AI_STEPS = [
    {"type": "tool_use", "id": "t1", "name": "retrieve", "input": {"query": "lãi suất qua đêm OMO"}},
    {"type": "tool_use", "id": "t2", "name": "run_sql", "input": {"sql": "SELECT ngay, lai_suat FROM lai_suat_lien_ngan_hang WHERE ky_han = 'ON' ORDER BY ngay DESC LIMIT 5"}},
    {"type": "tool_use", "id": "t3", "name": "submit", "input": {"answer": "Lãi suất qua đêm phiên gần nhất lấy từ bảng liên ngân hàng (giả lập kiểm thử).", "sql": "SELECT ngay, lai_suat FROM lai_suat_lien_ngan_hang WHERE ky_han = 'ON' ORDER BY ngay DESC LIMIT 5", "steps": ["Tra khái niệm", "Chạy SQL"]}},
]


async def main():
    url = os.environ.get("CFO_URL") or serve()
    import urllib.request
    urllib.request.urlopen(urllib.request.Request(url + "api/config", data=b'{"engine":"claude"}', headers={"content-type": "application/json"}))
    os.makedirs(SHOTS, exist_ok=True)
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None)
        for name, vp in [("desktop", {"width": 1280, "height": 860}), ("mobile", {"width": 390, "height": 844})]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=1)
            pg = await ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
            calls = {"n": "giả lập ở máy chủ"}
            await pg.goto(url)
            await pg.wait_for_selector(".kpis", timeout=30000)
            await pg.screenshot(path=f"{SHOTS}/{name}-tongquan.png", full_page=False)
            for cmd in ["biendo", "nganhang", "laisuat", "thanhkhoan", "omo", "cpi", "thamkhao", "tacdong ar=5 ap=3", "kichban usd=3 ls=2",
                        "canhbao", "cauhoi", "baocao", "thuatngu", "dinhnghia áp lực tỷ giá", "kiemtra giá vàng tuần này", "bang", "nguon", "api", "api cpi", "ai", "giaodien", "tongquan", "giaodien", "trogiup"]:
                await pg.fill("#cmd", cmd); await pg.press("#cmd", "Enter"); await pg.wait_for_timeout(250)
            if True:
                await pg.fill("#cmd", "sql SELECT ky_han, round(avg(lai_suat),2) ls, count(*) n FROM lai_suat_lien_ngan_hang GROUP BY 1 ORDER BY 1")
                await pg.press("#cmd", "Enter")
                await pg.wait_for_function("document.querySelectorAll('.entry').length && /dòng/.test(document.querySelector('.entry:last-child').innerText)", timeout=60000)
                await pg.fill("#cmd", "hoi lãi suất qua đêm gần đây thế nào?"); await pg.press("#cmd", "Enter")
                await pg.wait_for_selector(".entry:last-child .ans", timeout=60000)
            errors = await pg.eval_on_selector_all(".entry .err", "els => els.map(e => e.closest('.entry').querySelector('.cmdline').innerText + ' → ' + e.innerText)")
            await pg.screenshot(path=f"{SHOTS}/{name}-full.png", full_page=True)
            last = await pg.inner_text(".entry:last-child")
            print(f"[{name}] lệnh lỗi: {errors or 'không'} | lỗi JS: {errs or 'không'} | gọi AI giả lập: {calls['n']}")
            print(f"[{name}] khối cuối: {last[:300]!r}")
            fails += errors + errs
            await ctx.close()
        await b.close()
    sys.exit(1 if fails else 0)


asyncio.run(main())
