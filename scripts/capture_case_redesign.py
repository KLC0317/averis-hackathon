import os
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1536, "height": 920})
        page = await context.new_page()

        out_dir = r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7"

        # 1. Match Case: email_001 (Matching user's reference mockup with enlarged text)
        url_match = "http://localhost:5173/cases/4d21638c-dd97-4dbf-8002-e5046d0a2012"
        print(f"Navigating to {url_match}...")
        await page.goto(url_match, wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Ensure "Consignee" is clicked/active
        consignee_btn = page.locator("button.field-row-item:has-text('Consignee')")
        if await consignee_btn.count() > 0:
            await consignee_btn.first.click()
            await page.wait_for_timeout(500)

        match_path = os.path.join(out_dir, "case_redesign_match.png")
        await page.screenshot(path=match_path, full_page=True)
        print(f"Saved match screenshot to {match_path}")

        # 2. Test Comparison Details Tab
        details_tab = page.locator("button.stage-tab-btn:has-text('Comparison details')")
        if await details_tab.count() > 0:
            await details_tab.click()
            await page.wait_for_timeout(400)
            details_path = os.path.join(out_dir, "case_comparison_details.png")
            await page.screenshot(path=details_path, full_page=True)
            print(f"Saved comparison details screenshot to {details_path}")
            # switch back to Source evidence
            await page.locator("button.stage-tab-btn:has-text('Source evidence')").click()
            await page.wait_for_timeout(300)

        # 3. Test Open Original Doc Modal
        open_orig_btn = page.locator("button.doc-strip-link:has-text('Open original')").first
        if await open_orig_btn.count() > 0:
            await open_orig_btn.click()
            await page.wait_for_timeout(400)
            modal_path = os.path.join(out_dir, "case_docs_modal.png")
            await page.screenshot(path=modal_path, full_page=False)
            print(f"Saved modal screenshot to {modal_path}")
            # close modal
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(300)

        # 4. Discrepancy Case: email_004
        url_mismatch = "http://localhost:5173/cases/40d89d66-cbc6-4980-945d-ebc94856c194"
        print(f"Navigating to {url_mismatch}...")
        await page.goto(url_mismatch, wait_until="networkidle")
        await page.wait_for_timeout(1000)

        mismatch_path = os.path.join(out_dir, "case_redesign_discrepancy.png")
        await page.screenshot(path=mismatch_path, full_page=True)
        print(f"Saved mismatch screenshot to {mismatch_path}")

        # 5. User's active case: 240ee13e-0531-4e52-b994-aa8f08e88d95
        url_user = "http://localhost:5173/cases/240ee13e-0531-4e52-b994-aa8f08e88d95"
        print(f"Navigating to {url_user}...")
        await page.goto(url_user, wait_until="networkidle")
        await page.wait_for_timeout(1000)
        user_case_path = os.path.join(out_dir, "case_user_active.png")
        await page.screenshot(path=user_case_path, full_page=True)
        print(f"Saved user active case screenshot to {user_case_path}")

        # 6. Realistic Desktop Viewport Screenshot
        desktop_context = await browser.new_context(viewport={"width": 1536, "height": 960})
        desktop_page = await desktop_context.new_page()
        await desktop_page.goto(url_user, wait_until="networkidle")
        await desktop_page.wait_for_timeout(1000)
        desktop_path = os.path.join(out_dir, "case_desktop_view.png")
        await desktop_page.screenshot(path=desktop_path, full_page=False)
        print(f"Saved desktop viewport screenshot to {desktop_path}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
