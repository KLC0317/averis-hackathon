import asyncio
import time
from playwright.async_api import async_playwright

async def measure():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={"width": 1536, "height": 920})
        page = await context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1] Navigating to http://localhost:5173/inbox...")
        t0 = time.perf_counter()
        await page.goto("http://localhost:5173/inbox", wait_until="networkidle")
        print(f"    Inbox loaded in {(time.perf_counter() - t0)*1000:.1f}ms")

        # Give 400ms for idle prefetching to kick in
        await page.wait_for_timeout(400)

        # Measure transition 1: Click first case
        first_row = page.locator(".data-table tbody tr.clickable-row").first
        await first_row.wait_for(timeout=10000)
        first_row_text = await first_row.inner_text()
        first_id = first_row_text.split()[0] if first_row_text else "first"
        print(f"[2] Opening case from inbox ({first_id})...")

        click_start = time.perf_counter()
        await first_row.click()
        try:
            # Wait for the case wrap to be visible (not skeleton)
            await page.wait_for_selector(".case-redesign-wrap:not(.case-skeleton-wrap)", timeout=5000)
            t_rendered = time.perf_counter()
            duration_inbox_to_case = (t_rendered - click_start) * 1000
            print(f"    ==> Rendered case in {duration_inbox_to_case:.1f}ms! (Target: <100ms)")
        except Exception as e:
            print(f"    Timeout! Current URL: {page.url}")
            await page.screenshot(path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\perf_timeout_debug.png")
            print("    Console errors:", console_errors)
            raise e

        # Wait on case page so background prefetch of next cases finishes
        await page.wait_for_timeout(600)

        # Measure multiple sequential Next case transitions
        print("[3] Testing 4 rapid 'Next case' transitions...")
        for step in range(1, 5):
            next_btn = page.locator(".btn-next-case")
            if await next_btn.count() > 0:
                curr_url = page.url
                click_next_start = time.perf_counter()
                await next_btn.click()
                await page.wait_for_function(f"window.location.href !== '{curr_url}'")
                await page.wait_for_selector(".case-redesign-wrap:not(.case-skeleton-wrap)", timeout=5000)
                dur = (time.perf_counter() - click_next_start) * 1000
                print(f"    Step {step}: Transitioned to {page.url.split('/')[-1]} in {dur:.1f}ms!")
                # Brief human pause between reviews
                await page.wait_for_timeout(300)
            else:
                print(f"    Next button not available at step {step}")
                break

        # Take screenshot of the smoothly transitioned case
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\smooth_transition_verified.png"
        )
        print("    Saved verification screenshot to smooth_transition_verified.png")

        if console_errors:
            print(f"    Warning: {len(console_errors)} console error(s): {console_errors[:3]}")
        else:
            print("    Zero console errors!")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(measure())
