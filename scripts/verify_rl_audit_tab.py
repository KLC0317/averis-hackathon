import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 960})

        # 1. Test direct navigation to /evaluation?tab=reinforcement
        print("1. Navigating to http://localhost:5173/evaluation?tab=reinforcement...")
        await page.goto("http://localhost:5173/evaluation?tab=reinforcement", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Verify active pill
        active_pill = page.locator(".eval-nav-pill.active")
        text = await active_pill.inner_text()
        print(f"Active pill text: {text}")
        assert "Reinforcement Learning & Audit" in text, "Expected Reinforcement tab to be active"

        # Verify RL banner and KPIs
        banner_title = page.locator(".rl-banner-title")
        assert await banner_title.count() == 1
        print("PASS: RL banner title rendered!")

        kpis = page.locator(".rl-kpi-card")
        assert await kpis.count() >= 4
        print(f"PASS: {await kpis.count()} RL KPI cards rendered!")

        # Verify Audit Table has rows
        rows = page.locator(".rl-table tbody tr")
        row_count = await rows.count()
        print(f"PASS: Audit table rendered {row_count} rows!")
        assert row_count > 0, "Expected audit table to have rows from review_events"

        # Capture Evaluation RL tab screenshot
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\rl_audit_tab_evaluation.png",
            full_page=True
        )
        print("PASS: Evaluation RL tab screenshot saved!")

        # 2. Test filtering: click Taught Equivalences
        print("2. Testing filtering on Taught Equivalences...")
        equiv_btn = page.locator(".rl-filter-btn:has-text('Taught Equivalences')")
        await equiv_btn.click()
        await page.wait_for_timeout(400)
        filtered_rows = await page.locator(".rl-table tbody tr").count()
        print(f"Filtered rows for equivalences: {filtered_rows}")
        assert filtered_rows > 0

        # 3. Test Sidebar Navigation: click Dashboard then click RL Audit in sidebar
        print("3. Testing sidebar RL Audit navigation link...")
        await page.goto("http://localhost:5173/inbox", wait_until="networkidle")
        await page.wait_for_timeout(600)
        
        rl_nav = page.locator(".nav-item:has-text('RL Audit')")
        assert await rl_nav.count() == 1, "Sidebar should contain RL Audit link"
        await rl_nav.click()
        await page.wait_for_timeout(800)
        
        # Verify it opened evaluation with reinforcement tab
        active_pill_after = page.locator(".eval-nav-pill.active")
        assert "Reinforcement Learning & Audit" in await active_pill_after.inner_text()
        print("PASS: Sidebar RL Audit navigated directly to active tab!")

        # 4. Test Case Review Page RL & Audit Trail tab
        print("4. Testing case review page RL & Audit tab...")
        # Get first case link from table or navigate to a known case with events
        await page.goto("http://localhost:5173/cases/5abeb89e-91e7-405c-993e-55cac5ee5761", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        case_audit_tab = page.locator(".stage-tab-btn:has-text('RL & Audit Trail')")
        assert await case_audit_tab.count() == 1, "Expected RL & Audit Trail tab on case page"
        await case_audit_tab.click()
        await page.wait_for_timeout(500)

        # Capture Case Audit tab screenshot
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\rl_audit_tab_case.png",
            full_page=True
        )
        print("PASS: Case review RL & Audit tab screenshot saved!")

        await browser.close()
        print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
