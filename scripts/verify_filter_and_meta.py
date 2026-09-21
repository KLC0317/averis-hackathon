import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 920})

        # 1. Check Inbox
        print("Testing Inbox...")
        await page.goto("http://localhost:5173/inbox", wait_until="networkidle")
        await page.wait_for_timeout(500)

        # Check that Filter button is gone
        filter_btn_count = await page.locator("button:has-text('Filter')").count()
        print(f"Filter buttons found on inbox: {filter_btn_count} (Expected: 0)")
        assert filter_btn_count == 0, "Filter button should be removed from inbox"

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\inbox_filter_removed.png",
            full_page=False
        )
        print("Captured inbox screenshot!")

        # 2. Check Case Detail
        print("Testing Case Detail...")
        first_row = page.locator(".data-table tbody tr.clickable-row").first
        await first_row.click()
        await page.wait_for_selector(".case-redesign-wrap:not(.case-skeleton-wrap)", timeout=10000)
        await page.wait_for_timeout(500)

        # Check metadata line
        meta_text = await page.locator(".case-meta-line").inner_text()
        print("Case meta line content:", meta_text.encode("ascii", "replace").decode("ascii"))

        # Verify 'Version' is NOT present
        assert "Version" not in meta_text, f"'Version' should not be in meta line! Found: {meta_text}"
        print("Verified: 'Version' is absent!")

        # Verify useful fields are present
        assert "→" in meta_text or "Callao" in meta_text, "Route should be in meta line"
        print("Verified: Route is present!")

        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_header_useful_meta.png"
        )
        print("Captured case header screenshot!")

        await browser.close()
        print("ALL CHECKS PASSED!")

if __name__ == "__main__":
    asyncio.run(main())
