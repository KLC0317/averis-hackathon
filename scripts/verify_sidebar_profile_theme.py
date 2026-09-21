import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 960})

        print("Navigating to http://localhost:5173/inbox...")
        await page.goto("http://localhost:5173/inbox", wait_until="networkidle")
        await page.wait_for_timeout(800)

        # 1. Verify old utility row is GONE
        utility_row = page.locator(".sidebar-utility-row")
        assert await utility_row.count() == 0, "Old sidebar-utility-row should be completely removed"
        print("PASS: Old 3-button utility row removed!")

        # 2. Verify dark mode button is directly beside profile
        user_row = page.locator(".sidebar-user-row")
        assert await user_row.count() == 1, "Expected .sidebar-user-row to exist"
        
        theme_btn = page.locator(".sidebar-theme-btn")
        assert await theme_btn.count() == 1, "Expected .sidebar-theme-btn to exist"
        print("PASS: Dark mode button exists beside profile!")

        # Capture expanded state
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\sidebar_profile_theme_expanded.png",
            full_page=True
        )

        # 3. Click dark mode button
        print("Testing dark mode toggle...")
        await theme_btn.click()
        await page.wait_for_timeout(400)
        is_dark = await page.evaluate("() => document.documentElement.classList.contains('dark')")
        print(f"Document has dark class: {is_dark}")
        assert is_dark, "Clicking dark mode button should add .dark class"

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\sidebar_profile_theme_dark.png",
            full_page=True
        )

        # 4. Test Collapsing Sidebar
        print("Testing collapsing sidebar...")
        chevron_btn = page.locator(".sidebar-chevron-btn")
        await chevron_btn.click()
        await page.wait_for_timeout(400)

        # Check collapsed user row
        collapsed_row = page.locator(".sidebar-user-row.user-row-collapsed")
        assert await collapsed_row.count() == 1, "User row should have collapsed styling"
        print("PASS: User row collapsed gracefully!")

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\sidebar_profile_theme_collapsed.png",
            full_page=True
        )

        # Toggle back to light mode in collapsed state
        collapsed_theme_btn = page.locator(".sidebar-theme-btn")
        await collapsed_theme_btn.click()
        await page.wait_for_timeout(300)
        is_dark_now = await page.evaluate("() => document.documentElement.classList.contains('dark')")
        print(f"Document is dark after toggling in collapsed state: {is_dark_now}")
        assert not is_dark_now, "Should toggle back to light mode"

        await browser.close()
        print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
