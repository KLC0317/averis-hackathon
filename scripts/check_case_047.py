import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": 1536, "height": 920})
        await page.goto("http://localhost:5173/cases/aa28da13-ae2e-4a23-8a0d-4a2d12625966", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_047.png", full_page=True)
        content = await page.evaluate('''() => {
            return {
                title: document.querySelector('.case-title-block')?.innerText,
                statusBanner: document.querySelector('.case-status-banner')?.innerText,
                fieldsCount: document.querySelectorAll('.field-row-item').length,
                fieldsPanelHeader: document.querySelector('.fields-panel-header')?.innerText,
                messageContent: document.querySelector('pre')?.innerText
            };
        }''')
        print("CASE_047_DATA:", content)
        await b.close()

if __name__ == "__main__":
    asyncio.run(main())
