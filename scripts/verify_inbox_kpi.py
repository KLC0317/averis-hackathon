import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 960})
        
        page.on("console", lambda msg: print(f"[CONSOLE {msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: print(f"[PAGE ERROR] {err}"))
        page.on("response", lambda res: print(f"[HTTP {res.status}] {res.url}") if "/api/" in res.url else None)

        print("Navigating to http://localhost:5173/inbox...")
        await page.goto("http://localhost:5173/inbox", wait_until="networkidle")
        
        # Wait for table rows to be rendered (data loaded)
        print("Waiting for queue items to populate...")
        await page.wait_for_selector(".clickable-row", timeout=15000)
        await page.wait_for_timeout(500)

        # Read KPI values
        kpi_cards = page.locator(".kpi-card")
        count = await kpi_cards.count()
        print(f"Found {count} KPI cards")

        for i in range(count):
            label = await kpi_cards.nth(i).locator(".kpi-card-label").inner_text()
            val_el = kpi_cards.nth(i).locator(".kpi-card-value")
            val = await val_el.inner_text() if await val_el.count() > 0 else "N/A"
            print(f"  KPI {i+1}: {label} -> {val}")

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\inbox_kpi_verified.png",
            full_page=True
        )
        print("Screenshot saved to inbox_kpi_verified.png!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
