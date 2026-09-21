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
        await page.wait_for_selector(".todo-io-card", timeout=8000)

        # 1. All Pending - Page 1
        all_tab = page.locator(".todo-tab-btn.tab-all")
        await all_tab.click()
        await page.wait_for_timeout(600)
        cards_p1 = await page.locator(".todo-io-card").count()
        print(f"All Pending Page 1 cards count: {cards_p1} (should be 10)")
        assert cards_p1 == 10, f"Expected 10 cards, got {cards_p1}"

        path1 = os.path.join(ARTIFACTS_DIR, "todo_pagination_all_page1.png")
        await page.screenshot(path=path1)
        print(f"Captured: {path1}")

        # 2. Click Page 2
        next_btn = page.locator(".todo-pagination-controls button:has-text('Next')")
        await next_btn.click()
        await page.wait_for_timeout(600)
        cards_p2 = await page.locator(".todo-io-card").count()
        print(f"All Pending Page 2 cards count: {cards_p2} (should be 1)")
        assert cards_p2 == 1, f"Expected 1 card, got {cards_p2}"

        path2 = os.path.join(ARTIFACTS_DIR, "todo_pagination_all_page2.png")
        await page.screenshot(path=path2)
        print(f"Captured: {path2}")

        # 3. Switch to Resolved Tab
        resolved_tab = page.locator(".todo-tab-btn.tab-completed")
        await resolved_tab.click()
        await page.wait_for_timeout(600)
        cards_res_p1 = await page.locator(".todo-io-card").count()
        print(f"Resolved Page 1 cards count: {cards_res_p1} (should be 10)")
        assert cards_res_p1 == 10, f"Expected 10 cards on resolved page 1, got {cards_res_p1}"

        # Click Page 3 of Resolved
        p3_btn = page.locator(".todo-page-btn:text-is('3')")
        if await p3_btn.count() > 0:
            await p3_btn.click()
            await page.wait_for_timeout(600)
            cards_res_p3 = await page.locator(".todo-io-card").count()
            print(f"Resolved Page 3 cards count: {cards_res_p3} (should be 10)")
            assert cards_res_p3 == 10, f"Expected 10 cards on resolved page 3, got {cards_res_p3}"

        path3 = os.path.join(ARTIFACTS_DIR, "todo_pagination_resolved_page3.png")
        await page.screenshot(path=path3)
        print(f"Captured: {path3}")

        await browser.close()
        print("Todo pagination verified successfully!")

if __name__ == "__main__":
    asyncio.run(main())
