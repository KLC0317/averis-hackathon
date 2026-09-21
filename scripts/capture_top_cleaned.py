import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 920})
        await page.goto("http://localhost:5173/cases/aa28da13-ae2e-4a23-8a0d-4a2d12625966", wait_until="domcontentloaded")
        await page.wait_for_selector(".case-redesign-wrap:not(.case-skeleton-wrap)", timeout=15000)
        await page.wait_for_timeout(1000)
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_top_cleaned.png",
            full_page=False
        )
        print("Captured cleaned header screenshot successfully!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
