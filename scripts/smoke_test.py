#!/usr/bin/env python3
"""Kiểm thử khói cho CFO Terminal bằng trình duyệt thật (Playwright).

Chạy:  python scripts/smoke_test.py            # cần: pip install playwright && playwright install chromium
Tuỳ chọn biến môi trường:
  CFO_URL      trang cần thử (mặc định tự mở máy chủ tĩnh ở thư mục gốc dự án)
  DUCK_ESM     tệp duckdb ESM đã bundle, DUCK_DIST thư mục dist của @duckdb/duckdb-wasm (chạy không cần CDN)
  CHROME       đường dẫn Chrome nếu không dùng bản của Playwright
Kịch bản AI được giả lập: retrieve → run_sql → submit, để thử vòng lặp mà không tốn khoá.
"""
import asyncio, functools, http.server, json, os, re, socketserver, sys, threading

from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DUCK_ESM, DUCK_DIST = os.environ.get("DUCK_ESM"), os.environ.get("DUCK_DIST")
SHOTS = os.environ.get("SHOTS", "/tmp/cfo-shots")


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    h.log_message = lambda *a: None
    s = socketserver.TCPServer(("127.0.0.1", 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{s.server_address[1]}/"


AI_STEPS = [
    {"type": "tool_use", "id": "t1", "name": "retrieve", "input": {"query": "lãi suất qua đêm OMO"}},
    {"type": "tool_use", "id": "t2", "name": "run_sql", "input": {"sql": "SELECT ngay, lai_suat FROM lai_suat_lien_ngan_hang WHERE ky_han = 'ON' ORDER BY ngay DESC LIMIT 5"}},
    {"type": "tool_use", "id": "t3", "name": "submit", "input": {"answer": "Lãi suất qua đêm phiên gần nhất lấy từ bảng liên ngân hàng (giả lập kiểm thử).", "sql": "SELECT ngay, lai_suat FROM lai_suat_lien_ngan_hang WHERE ky_han = 'ON' ORDER BY ngay DESC LIMIT 5", "steps": ["Tra khái niệm", "Chạy SQL"]}},
]


async def main():
    url = os.environ.get("CFO_URL") or serve()
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
            if DUCK_ESM:
                await pg.route(re.compile(r".*/\+esm$"), lambda r: r.fulfill(path=DUCK_ESM, headers={"content-type": "text/javascript", "access-control-allow-origin": "*"}))
                async def dist(route):
                    f = route.request.url.split("/dist/")[-1]
                    ct = "application/wasm" if f.endswith(".wasm") else "text/javascript"
                    await route.fulfill(path=os.path.join(DUCK_DIST, f), headers={"content-type": ct, "access-control-allow-origin": "*"})
                await pg.route(re.compile(r"https://cdn\.jsdelivr\.net/npm/@duckdb/.*/dist/.*"), dist)
            calls = {"n": 0}
            async def ask(route):
                body = json.loads(route.request.post_data)
                i = sum(1 for m in body["messages"] if m["role"] == "assistant")
                calls["n"] += 1
                await route.fulfill(json={"content": [AI_STEPS[min(i, 2)]], "stop_reason": "tool_use"})
            await pg.route("**/api/v1/ai", ask)

            await pg.goto(url)
            await pg.wait_for_selector(".kpis", timeout=30000)
            await pg.screenshot(path=f"{SHOTS}/{name}-tongquan.png", full_page=False)
            for cmd in ["biendo", "nganhang", "laisuat", "thanhkhoan", "omo", "cpi", "thamkhao", "tacdong ar=5 ap=3", "kichban usd=3 ls=2",
                        "canhbao", "cauhoi", "baocao", "thuatngu", "dinhnghia áp lực tỷ giá", "kiemtra giá vàng tuần này", "bang", "nguon", "api", "api cpi", "giaodien", "tongquan", "giaodien", "trogiup"]:
                await pg.fill("#cmd", cmd); await pg.press("#cmd", "Enter"); await pg.wait_for_timeout(250)
            if DUCK_ESM:
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
