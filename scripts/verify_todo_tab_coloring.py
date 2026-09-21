import asyncio
import os
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\kianl\averis-hackathon\brain\835dc613-9302-41dd-ad4b-173942bb84d7"
if not os.path.exists(ARTIFACTS_DIR):
    ARTIFACTS_DIR = r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        print("Navigating to http://localhost:5173/todo...")
        await page.goto("http://localhost:5173/todo", wait_until="networkidle")
        
        # Wait for data to load
        try:
            await page.wait_for_selector(".todo-io-card", timeout=8000)
        except Exception:
            # If cache was empty, wait a moment and refresh
            await page.wait_for_timeout(3000)

        # 1. Capture All Pending (Light Mode)
        all_tab = page.locator(".todo-tab-btn.tab-all")
        await all_tab.click()
        await page.wait_for_timeout(600)
        path1 = os.path.join(ARTIFACTS_DIR, "todo_tab_all_pending.png")
        await page.screenshot(path=path1)
        print(f"Captured: {path1}")

        # 2. Click Urgent Tab
        urgent_tab = page.locator(".todo-tab-btn.tab-urgent")
        await urgent_tab.click()
        await page.wait_for_timeout(600)
        path2 = os.path.join(ARTIFACTS_DIR, "todo_tab_urgent.png")
        await page.screenshot(path=path2)
        print(f"Captured: {path2}")

        # 3. Click Field Mismatches Tab
        diffs_tab = page.locator(".todo-tab-btn.tab-diffs")
        await diffs_tab.click()
        await page.wait_for_timeout(600)
        path3 = os.path.join(ARTIFACTS_DIR, "todo_tab_diffs.png")
        await page.screenshot(path=path3)
        print(f"Captured: {path3}")

        # 4. Click Resolved Tab
        comp_tab = page.locator(".todo-tab-btn.tab-completed")
        await comp_tab.click()
        await page.wait_for_timeout(600)
        path4 = os.path.join(ARTIFACTS_DIR, "todo_tab_resolved.png")
        await page.screenshot(path=path4)
        print(f"Captured: {path4}")

        await browser.close()
        print("Completed!")

if __name__ == "__main__":
    asyncio.run(main())
