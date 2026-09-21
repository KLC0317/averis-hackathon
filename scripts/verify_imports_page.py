import asyncio
import os
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        page.on("console", lambda msg: print(f"Browser console [{msg.type}]: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser pageerror: {err}"))

        print("Navigating to http://localhost:5173/imports...")
        await page.goto("http://localhost:5173/imports", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # Verify active manifest title
        manifest_title = await page.locator(".card-heading h3").first.inner_text()
        print(f"Active Manifest Title: {manifest_title}")
        assert "mailbox" not in manifest_title.lower(), f"Unexpected 'mailbox' found in manifest title: {manifest_title}"

        # Verify table rows
        rows_text = await page.locator(".data-table tbody").inner_text()
        print(f"Table content snippet: {rows_text[:200]}")
        assert "mailbox" not in rows_text.lower(), f"Unexpected 'mailbox' found in imports table: {rows_text}"

        # Capture Light Mode screenshot
        path_light = os.path.join(ARTIFACTS_DIR, "imports_page_clean.png")
        await page.screenshot(path=path_light)
        print(f"Captured: {path_light}")

        # Capture Dark Mode screenshot
        await page.evaluate("() => document.documentElement.classList.add('dark')")
        await page.wait_for_timeout(500)
        path_dark = os.path.join(ARTIFACTS_DIR, "imports_page_clean_dark.png")
        await page.screenshot(path=path_dark)
        print(f"Captured: {path_dark}")

        await browser.close()
        print("Imports verification passed with 0 mailbox entries!")

if __name__ == "__main__":
    asyncio.run(main())
