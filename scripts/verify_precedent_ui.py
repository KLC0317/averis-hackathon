import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 960})

        case_id = "5abeb89e-91e7-405c-993e-55cac5ee5761"
        print(f"Navigating to case {case_id} (email_291)...")
        await page.goto(f"http://localhost:5173/cases/{case_id}", wait_until="networkidle")

        # Wait for page to render
        await page.wait_for_selector(".field-row-item", timeout=12000)
        print("Page loaded. Looking for Container Count field...")

        # Click the Container Count field in sidebar
        items = page.locator(".field-row-item")
        count = await items.count()
        print(f"Found {count} sidebar items.")
        for i in range(count):
            text = await items.nth(i).inner_text()
            print(f"Item {i}: {text.strip()!r}")
            if "container" in text.lower():
                print(f"Clicking Container item at index {i}: {text.strip()[:40]}")
                await items.nth(i).click()
                break

        await page.wait_for_timeout(600)

        # Check for .precedent-review-card
        card = page.locator(".precedent-review-card")
        is_visible = await card.is_visible()
        print("Is .precedent-review-card visible?", is_visible)
        assert is_visible, "Expected .precedent-review-card to be visible!"

        card_text = await card.inner_text()
        print("\n--- Card Content ---")
        print(card_text.encode("ascii", errors="replace").decode("ascii"))
        print("--------------------\n")

        # Screenshot of Precedent Review Aid
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\taught_precedent_review_aid.png"
        )
        print("Saved screenshot: taught_precedent_review_aid.png")

        # Now click "Edit Rationale" to inspect the Teach Equivalence modal
        print("Clicking 'Edit Rationale' button...")
        edit_btn = page.locator("button:has-text('Edit Rationale')")
        await edit_btn.click()
        await page.wait_for_timeout(400)

        modal = page.locator(".command-modal")
        modal_visible = await modal.is_visible()
        print("Is Teach Equivalence modal visible?", modal_visible)
        assert modal_visible, "Expected modal to be visible!"

        # Screenshot of Teach Equivalence modal
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\teach_equivalence_modal.png"
        )
        print("Saved screenshot: teach_equivalence_modal.png")

        # Close modal
        cancel_btn = page.locator(".command-modal button:has-text('Cancel')")
        await cancel_btn.click()
        await page.wait_for_timeout(300)

        # Now click "Apply Precedent (1-Click Confirm)"
        print("Clicking 'Apply Precedent (1-Click Confirm)'...")
        apply_btn = page.locator("button:has-text('Apply Precedent')")
        await apply_btn.click()
        await page.wait_for_timeout(1000)

        # Take screenshot of resolved state
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\taught_precedent_confirmed.png"
        )
        print("Saved screenshot: taught_precedent_confirmed.png")
        print("\n>>> UI VERIFICATION PASSED COMPLETELY! <<<")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
