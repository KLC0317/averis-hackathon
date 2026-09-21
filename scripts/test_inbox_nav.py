import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 920})

        # Test navigating to email_001
        await page.goto("http://localhost:5173/inbox", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Click first case in queue
        first_row = page.locator(".queue-table tbody tr").first
        await first_row.click()

        # Check that page loads
        await page.wait_for_selector(".case-redesign-wrap:not(.case-skeleton-wrap)", timeout=15000)
        await page.wait_for_timeout(1000)
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_from_inbox_loaded.png",
            full_page=True
        )
        print("Captured loaded case from inbox!")

        # Click Next case button
        next_btn = page.locator(".btn-next-case")
        await next_btn.click()
        await page.wait_for_timeout(400)
        # Wait for next case
        await page.wait_for_selector(".case-redesign-wrap:not(.case-skeleton-wrap)", timeout=15000)
        await page.wait_for_timeout(1000)
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_second_from_inbox_loaded.png",
            full_page=True
        )
        print("Captured second case from inbox!")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
