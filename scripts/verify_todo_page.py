import asyncio
import re
from playwright.async_api import async_playwright

EMOJI_REGEX = re.compile(
    r"[\U00010000-\U0010ffff\u2600-\u26ff\u2700-\u27bf\u2300-\u23ff\u2b50\u2b06\u2934\u25aa\u25ab]"
)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 960})

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1] Navigating to http://localhost:5173/todo...")
        await page.goto("http://localhost:5173/todo", wait_until="networkidle")
        
        # Wait for task cards to be rendered
        await page.wait_for_selector(".todo-io-card", timeout=12000)
        await page.wait_for_timeout(400)

        if console_errors:
            print("Console errors:", console_errors)

        # Check page header
        header_el = page.locator(".page-header h1")
        header_text = await header_el.inner_text()
        print("Page header:", header_text)
        assert "To-do List" in header_text

        # Verify task items exist
        cards = page.locator(".todo-io-card")
        card_count = await cards.count()
        print(f"Total task cards rendered: {card_count}")
        assert card_count > 0, "Expected task cards to be rendered on To-do list"

        # Check that NO emojis exist on the page
        body_text = await page.locator("body").inner_text()
        emojis_found = EMOJI_REGEX.findall(body_text)
        print("Emojis found on page:", emojis_found)
        assert len(emojis_found) == 0, f"Found unexpected emojis on page: {emojis_found}"
        print("PASS: Zero emojis detected on page!")

        # Verify enhanced tab selector exists and has correct tabs
        tabs = page.locator(".todo-tab-btn")
        tab_count = await tabs.count()
        print(f"Tab selector buttons count: {tab_count}")
        assert tab_count >= 6, "Expected at least 6 filter tabs"

        # Capture light mode overview
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\todo_redesign_overview.png",
            full_page=True
        )
        print("Captured overview screenshot!")

        # [2] Test Urgent tab
        print("[2] Testing Urgent filter...")
        urgent_btn = page.locator(".todo-tab-btn:has-text('Urgent')")
        await urgent_btn.click()
        await page.wait_for_timeout(400)
        urgent_count = await page.locator(".todo-io-card").count()
        print(f"Urgent cards count: {urgent_count}")
        assert urgent_count > 0

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\todo_redesign_urgent.png",
            full_page=True
        )

        # [3] Test Arbitrations tab
        print("[3] Testing Arbitrations filter...")
        arb_btn = page.locator(".todo-tab-btn:has-text('Arbitrations')")
        await arb_btn.click()
        await page.wait_for_timeout(400)
        arb_count = await page.locator(".todo-io-card").count()
        print(f"Arbitration cards count: {arb_count}")
        assert arb_count > 0

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\todo_redesign_arbitration.png",
            full_page=True
        )

        # [4] Test Toggling Task Checkbox
        print("[4] Testing task toggle checkbox...")
        first_checkbox = page.locator(".todo-io-checkbox").first
        await first_checkbox.click()
        await page.wait_for_timeout(400)
        new_arb_count = await page.locator(".todo-io-card").count()
        print(f"Arbitration count after completing one task: {new_arb_count} (was {arb_count})")
        assert new_arb_count == arb_count - 1, "Completed task should be cleared from pending list"

        # Check Resolved tab
        resolved_tab = page.locator(".todo-tab-btn:has-text('Resolved')")
        await resolved_tab.click()
        await page.wait_for_timeout(400)
        resolved_count = await page.locator(".todo-io-card").count()
        print(f"Resolved tasks count: {resolved_count}")
        assert resolved_count > 0, "Completed task should appear under Resolved tab"

        # Capture Resolved view
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\todo_redesign_resolved.png",
            full_page=True
        )

        # [5] Test Dark Mode Theme
        print("[5] Testing Dark Mode...")
        await page.evaluate("() => document.documentElement.classList.add('dark')")
        await page.wait_for_timeout(300)

        all_tab = page.locator(".todo-tab-btn:has-text('All Pending')")
        await all_tab.click()
        await page.wait_for_timeout(400)

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\todo_redesign_dark.png",
            full_page=True
        )
        print("Captured dark mode screenshot!")

        # Revert dark mode
        await page.evaluate("() => document.documentElement.classList.remove('dark')")

        # [6] Test Review Navigation to case workspace
        print("[6] Testing Review navigation to case...")
        review_btn = page.locator(".todo-io-action-btn").first
        await review_btn.click()
        await page.wait_for_selector(".case-redesign-wrap:not(.case-skeleton-wrap)", timeout=10000)
        print("Successfully navigated to case workspace! Current URL:", page.url)

        await browser.close()
        print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
