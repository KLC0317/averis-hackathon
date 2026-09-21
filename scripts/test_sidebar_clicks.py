import asyncio
import time
from playwright.async_api import async_playwright

async def inspect():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # Viewport matching user state
        page = await browser.new_page(viewport={'width': 1536, 'height': 730})
        await page.goto('http://localhost:5173/inbox', wait_until='networkidle')
        await page.wait_for_timeout(300)
        
        print("=== [1] Testing Nav Items Click & Fast Navigation ===")
        # Test clicking To-do List
        todo_link = page.locator('.nav-item:has-text("To-do List")').first
        await todo_link.hover()
        t0 = time.perf_counter()
        await todo_link.click()
        await page.wait_for_url("**/todo", timeout=5000)
        t1 = time.perf_counter()
        print(f"Navigated to /todo in {round((t1-t0)*1000)}ms! URL: {page.url}")

        # Test clicking Imports
        imports_link = page.locator('.nav-item:has-text("Imports")').first
        await imports_link.hover()
        t0 = time.perf_counter()
        await imports_link.click()
        await page.wait_for_url("**/imports", timeout=5000)
        t1 = time.perf_counter()
        print(f"Navigated to /imports in {round((t1-t0)*1000)}ms! URL: {page.url}")

        # Test clicking Dashboard
        dash_link = page.locator('.nav-item:has-text("Dashboard")').first
        await dash_link.hover()
        t0 = time.perf_counter()
        await dash_link.click()
        await page.wait_for_url("**/inbox*", timeout=5000)
        t1 = time.perf_counter()
        print(f"Navigated to /inbox in {round((t1-t0)*1000)}ms! URL: {page.url}")

        print("\n=== [2] Testing Workspace Dropdown Outside-Click ===")
        ws_btn = page.locator('button.nav-item:has-text("Averis SDOC")')
        await ws_btn.click()
        await page.wait_for_timeout(150)
        card_visible = await page.locator('.card:has-text("Select Workspace")').count()
        print(f"Workspace dropdown opened: {card_visible > 0}")
        
        # Click outside on main area
        await page.mouse.click(500, 300)
        await page.wait_for_timeout(150)
        card_still_visible = await page.locator('.card:has-text("Select Workspace")').count()
        print(f"Workspace dropdown closed on outside click: {card_still_visible == 0}")
        assert card_still_visible == 0, "Workspace dropdown should close on outside click"

        print("\n=== [3] Testing Collapsed Rail Hitbox & Toggling ===")
        toggle_btn = page.locator('.sidebar-toggle-btn').first
        await toggle_btn.click()
        await page.wait_for_timeout(250)
        is_collapsed = await page.locator('.sidebar-collapsed').count()
        print(f"Sidebar collapsed: {is_collapsed > 0}")

        # In collapsed state, test clicking To-do List rail item
        todo_rail = page.locator('.sidebar-collapsed a[href="/todo"]')
        box = await todo_rail.bounding_box()
        print(f"Collapsed To-do link box: {box}")
        assert box['width'] >= 50, f"Expected generous hit width, got {box['width']}"
        await todo_rail.click()
        await page.wait_for_url("**/todo", timeout=5000)
        print(f"Navigated via collapsed rail icon to: {page.url}")

        # Expand via rail header
        expand_btn = page.locator('.sidebar-rail-header-btn')
        await expand_btn.click()
        await page.wait_for_timeout(250)
        is_collapsed_after = await page.locator('.sidebar-collapsed').count()
        print(f"Sidebar expanded after header click: {is_collapsed_after == 0}")
        assert is_collapsed_after == 0

        # Capture desktop screenshot
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\sidebar_desktop_responsive.png",
            full_page=False
        )

        print("\n=== [4] Testing Mobile Viewport (< 768px) Drawer ===")
        await page.set_viewport_size({'width': 480, 'height': 800})
        await page.wait_for_timeout(250)

        # Mobile menu trigger should be visible
        mobile_trigger = page.locator('.mobile-sidebar-toggle-btn')
        is_trigger_visible = await mobile_trigger.is_visible()
        print(f"Mobile trigger visible: {is_trigger_visible}")
        assert is_trigger_visible, "Mobile menu toggle button should be visible"

        # Click mobile menu trigger
        await mobile_trigger.click()
        await page.wait_for_timeout(250)
        is_drawer_open = await page.locator('.sidebar-mobile-open').count()
        print(f"Mobile sidebar drawer opened: {is_drawer_open > 0}")
        assert is_drawer_open > 0

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\sidebar_mobile_drawer_open.png",
            full_page=False
        )

        # Click a nav item in mobile mode - drawer should navigate and close
        mobile_dash_link = page.locator('.sidebar-mobile-open .nav-item:has-text("Dashboard")')
        await mobile_dash_link.click()
        await page.wait_for_timeout(350)
        is_drawer_open_after = await page.locator('.sidebar-mobile-open').count()
        print(f"Mobile drawer closed automatically on link click: {is_drawer_open_after == 0}")
        assert is_drawer_open_after == 0

        print("\nALL SIDEBAR RESPONSIVENESS CHECKS PASSED!")
        await browser.close()

if __name__ == '__main__':
    asyncio.run(inspect())
