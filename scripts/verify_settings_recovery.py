import asyncio
import os
import sqlite3
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        print("Navigating to http://localhost:5173/settings...")
        await page.goto("http://localhost:5173/settings", wait_until="networkidle")

        # Wait for benchmark card
        await page.wait_for_selector("text=Recover Optimal Benchmark Data", timeout=10000)
        await page.wait_for_timeout(1000)

        # Verify button exists
        recover_btn = page.locator("button:has-text('Recover our best data')")
        assert await recover_btn.count() > 0, "Recover our best data button not found!"

        # Screenshot before recovery (Light mode)
        path_before = os.path.join(ARTIFACTS_DIR, "settings_recovery_card_light.png")
        await page.screenshot(path=path_before)
        print(f"Captured: {path_before}")

        # Click the recovery button
        print("Clicking 'Recover our best data'...")
        await recover_btn.click()

        # Wait for success notification or notice
        await page.wait_for_selector("text=Restored at", timeout=10000)
        await page.wait_for_timeout(1000)

        # Screenshot after recovery (Light mode)
        path_after = os.path.join(ARTIFACTS_DIR, "settings_recovered_banner_light.png")
        await page.screenshot(path=path_after)
        print(f"Captured: {path_after}")

        # Switch to Dark Mode
        await page.evaluate("() => document.documentElement.classList.add('dark')")
        await page.wait_for_timeout(500)
        path_dark = os.path.join(ARTIFACTS_DIR, "settings_recovered_banner_dark.png")
        await page.screenshot(path=path_dark)
        print(f"Captured: {path_dark}")

        # Verify DB directly
        db = sqlite3.connect("var/cleardraft.db")
        case_cnt = db.execute("SELECT COUNT(*) FROM cases").fetchone()[0]
        imp_cnt = db.execute("SELECT COUNT(*) FROM imports").fetchone()[0]
        ex_cnt = db.execute("SELECT COUNT(*) FROM prompt_example_sets").fetchone()[0]
        print(f"DB verification: {case_cnt} cases, {imp_cnt} imports, {ex_cnt} prompt_example_sets")
        assert case_cnt == 520, f"Expected 520 cases, found {case_cnt}"
        assert ex_cnt == 0, f"Expected 0 prompt_example_sets after reset, found {ex_cnt}"

        await browser.close()
        print("Settings recovery verification completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
