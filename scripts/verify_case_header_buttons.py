import asyncio
import os
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        print("Navigating to case review page...")
        await page.goto("http://localhost:5173/cases/ceddceca-79a8-44c8-a66f-efe02a7e9aaa", wait_until="networkidle")

        # Wait for action buttons to be ready
        await page.wait_for_selector(".case-header-actions", timeout=10000)
        await page.wait_for_timeout(1000)

        # 1. Full header light mode
        header_actions = page.locator(".case-header-actions")
        await header_actions.scroll_into_view_if_needed()

        path_actions_light = os.path.join(ARTIFACTS_DIR, "case_header_actions_light.png")
        await header_actions.screenshot(path=path_actions_light)
        print(f"Captured: {path_actions_light}")

        # Top section screenshot light mode
        case_header_area = page.locator(".case-header-row")
        path_header_light = os.path.join(ARTIFACTS_DIR, "case_review_header_light.png")
        await case_header_area.screenshot(path=path_header_light)
        print(f"Captured: {path_header_light}")

        # 2. Hover states in light mode
        correct_btn = page.locator(".case-btn-correct")
        await correct_btn.hover()
        await page.wait_for_timeout(300)
        path_hover_correct = os.path.join(ARTIFACTS_DIR, "case_btn_correct_hover.png")
        await header_actions.screenshot(path=path_hover_correct)
        print(f"Captured: {path_hover_correct}")

        upload_btn = page.locator(".case-btn-upload")
        await upload_btn.hover()
        await page.wait_for_timeout(300)
        path_hover_upload = os.path.join(ARTIFACTS_DIR, "case_btn_upload_hover.png")
        await header_actions.screenshot(path=path_hover_upload)
        print(f"Captured: {path_hover_upload}")

        history_btn = page.locator(".case-btn-history")
        await history_btn.hover()
        await page.wait_for_timeout(300)
        path_hover_history = os.path.join(ARTIFACTS_DIR, "case_btn_history_hover.png")
        await header_actions.screenshot(path=path_hover_history)
        print(f"Captured: {path_hover_history}")

        # 3. Switch to Dark Mode
        await page.evaluate("() => document.documentElement.classList.add('dark')")
        await page.wait_for_timeout(500)

        # Move mouse away so no button is hovered initially
        await page.mouse.move(0, 0)
        await page.wait_for_timeout(200)

        path_actions_dark = os.path.join(ARTIFACTS_DIR, "case_header_actions_dark.png")
        await header_actions.screenshot(path=path_actions_dark)
        print(f"Captured: {path_actions_dark}")

        path_header_dark = os.path.join(ARTIFACTS_DIR, "case_review_header_dark.png")
        await case_header_area.screenshot(path=path_header_dark)
        print(f"Captured: {path_header_dark}")

        # Hover state in dark mode
        await correct_btn.hover()
        await page.wait_for_timeout(300)
        path_dark_hover_correct = os.path.join(ARTIFACTS_DIR, "case_btn_correct_dark_hover.png")
        await header_actions.screenshot(path=path_dark_hover_correct)
        print(f"Captured: {path_dark_hover_correct}")

        await browser.close()
        print("All case header verification screenshots successfully captured!")

if __name__ == "__main__":
    asyncio.run(main())
