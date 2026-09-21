import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": 1536, "height": 920})
        await page.goto("http://localhost:5173/cases/ae2a9f7d-e2df-4bc8-ad9b-c0a1e72609b7", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=r"C:\Users\kianl\averis-hackathon\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_ae2a.png", full_page=True)
        content = await page.evaluate('''() => {
            return {
                title: document.querySelector('.case-title-block')?.innerText,
                statusBanner: document.querySelector('.case-status-banner')?.innerText,
                fieldsCount: document.querySelectorAll('.field-row-item').length,
                fieldsPanelHeader: document.querySelector('.fields-panel-header')?.innerText,
                messageContent: document.querySelector('pre')?.innerText
            };
        }''')
        print("CASE_DATA:", content)
        await b.close()

if __name__ == "__main__":
    asyncio.run(main())
