import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1536, "height": 920})

        # Intercept backend API call to add an intentional 2.5s delay to capture the Skeleton UI
        async def handle_route(route):
            url = route.request.url
            if ":8000/cases/" in url:
                print("Delaying API call to show skeleton:", url)
                await asyncio.sleep(2.0)
                await route.continue_()
            else:
                await route.continue_()

        await page.route("**/*", handle_route)

        print("Navigating to case...")
        # Navigate to case
        await page.goto("http://localhost:5173/cases/aa28da13-ae2e-4a23-8a0d-4a2d12625966", wait_until="domcontentloaded")

        # Wait for skeleton wrap to appear
        print("Waiting for skeleton UI...")
        skeleton = page.locator(".case-skeleton-wrap")
        await skeleton.wait_for(state="visible", timeout=10000)
        print("Found .case-skeleton-wrap! Taking screenshot of Skeleton UI...")
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_skeleton_redesign.png",
            full_page=True
        )

        # Wait for actual content to load once API finishes
        print("Waiting for case content to load...")
        content = page.locator(".case-redesign-wrap:not(.case-skeleton-wrap)")
        await content.wait_for(state="visible", timeout=15000)
        await page.wait_for_timeout(800)
        await page.screenshot(
            path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_loaded_after_skeleton.png",
            full_page=True
        )
        print("Captured loaded case screenshot!")

        # Now test clicking Next case
        next_btn = page.locator(".btn-next-case")
        if await next_btn.count() > 0:
            print("Clicking Next case button...")
            await next_btn.click()
            # Capture transition state with loading indicator / skeleton
            await page.wait_for_timeout(400)
            await page.screenshot(
                path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_next_transition_skeleton.png",
                full_page=True
            )
            print("Captured Next case transition screenshot!")

            # Wait for next case to finish loading
            await page.wait_for_timeout(2500)
            await page.screenshot(
                path=r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7\case_next_loaded.png",
                full_page=True
            )
            print("Captured second case loaded screenshot!")

        await browser.close()
        print("ALL TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
