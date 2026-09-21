import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 960})

        print("Navigating to http://localhost:5173/inbox...")
        await page.goto("http://localhost:5173/inbox", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # 1. Verify telemetry chips are gone
        telemetry = page.locator(".funnel-telemetry-group")
        assert await telemetry.count() == 0, "Funnel telemetry group should be removed"
        print("PASS: Funnel telemetry group is gone!")

        # 2. Check for any text matching 'avg dwell'
        content = await page.content()
        assert "avg dwell" not in content, "avg dwell should not appear on dashboard"
        assert "h saved" not in content, "h saved should not appear on dashboard"
        print("PASS: No 'avg dwell' or 'h saved' found on dashboard!")

        # Capture screenshot
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\dashboard_telemetry_removed.png",
            full_page=True
        )
        print("PASS: Screenshot captured successfully!")

        await browser.close()
        print("VERIFICATION COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
