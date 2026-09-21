import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 920})

        print("Navigating to http://localhost:5173/inbox ...")
        await page.goto("http://localhost:5173/inbox", wait_until="networkidle")

        # 1. Verify expanded sidebar state
        chevron_btn = page.locator(".sidebar-chevron-btn")
        await chevron_btn.wait_for(state="visible", timeout=10000)
        print("Found .sidebar-chevron-btn in expanded sidebar!")

        # Verify bottom utility buttons count (should be exactly 3, no collapse button)
        utility_btns = page.locator(".sidebar-utility-row .utility-btn")
        count = await utility_btns.count()
        print(f"Number of utility buttons in footer: {count} (expected: 3)")
        assert count == 3, f"Expected 3 utility buttons, got {count}"

        # Capture screenshot of expanded sidebar
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\sidebar_expanded_redesign.png"
        )
        print("Captured sidebar_expanded_redesign.png")

        # 2. Click the chevron button to collapse
        print("Clicking chevron collapse button...")
        await chevron_btn.click()
        await page.wait_for_timeout(400)

        # Verify collapsed state
        sidebar = page.locator("aside.sidebar")
        classes = await sidebar.get_attribute("class")
        print(f"Sidebar classes after collapse: {classes}")
        assert "sidebar-collapsed" in (classes or ""), "Sidebar did not receive .sidebar-collapsed"

        collapsed_chevron = page.locator(".sidebar-chevron-btn.collapsed")
        await collapsed_chevron.wait_for(state="visible", timeout=5000)
        print("Found .sidebar-chevron-btn.collapsed in rail header!")

        # Verify no floating expand button over main content
        floating_btn = page.locator(".collapsed-main-expand-btn")
        assert not await floating_btn.is_visible(), "Expected no floating expand button on main content"

        # Capture screenshot of collapsed sidebar
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\sidebar_collapsed_redesign.png"
        )
        print("Captured sidebar_collapsed_redesign.png")

        # 3. Click the collapsed chevron button to expand back
        print("Clicking chevron expand button in rail...")
        await collapsed_chevron.click()
        await page.wait_for_timeout(400)

        classes_reexpanded = await sidebar.get_attribute("class")
        print(f"Sidebar classes after re-expansion: {classes_reexpanded}")
        assert "sidebar-collapsed" not in (classes_reexpanded or ""), "Sidebar did not re-expand"

        print("\n>>> ALL SIDEBAR REDESIGN CHECKS PASSED! <<<")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
