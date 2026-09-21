import asyncio
from playwright.async_api import async_playwright

async def check():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": 1536, "height": 920})
        await page.goto('http://localhost:5173/cases/240ee13e-0531-4e52-b994-aa8f08e88d95', wait_until='networkidle')
        await page.wait_for_timeout(1000)
        h = await page.evaluate('''() => {
            const el = document.querySelector('.viewer-lines-container');
            const style = window.getComputedStyle(el);
            const panel = document.querySelector('.case-stage-panel');
            return {
                linesClientHeight: el.clientHeight,
                linesScrollHeight: el.scrollHeight,
                linesComputedHeight: style.height,
                linesMinHeight: style.minHeight,
                linesMaxHeight: style.maxHeight,
                panelHeight: panel.clientHeight
            };
        }''')
        print("EVAL RESULT:", h)
        await b.close()

if __name__ == '__main__':
    asyncio.run(check())
