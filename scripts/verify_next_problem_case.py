import asyncio
import json
import os
import urllib.request
from playwright.async_api import async_playwright

ARTIFACTS_DIR = r"C:\Users\kianl\averis-hackathon\brain\835dc613-9302-41dd-ad4b-173942bb84d7"
if not os.path.exists(ARTIFACTS_DIR):
    ARTIFACTS_DIR = r"C:\Users\kianl\.gemini\antigravity-ide\brain\835dc613-9302-41dd-ad4b-173942bb84d7"

def get_cases_from_frontend_proxy():
    req = urllib.request.urlopen("http://localhost:5173/api/v1/cases?limit=1000")
    raw = json.loads(req.read().decode("utf-8"))
    return raw

def is_problem(c):
    if c.get("state") == "Complete":
        return (c.get("confirmed_differences") or 0) > 0 or (c.get("unresolved_fields") or 0) > 0
    return True

async def main():
    all_cases = get_cases_from_frontend_proxy()
    problem_cases = [c for c in all_cases if is_problem(c)]
    print(f"Total cases from API: {len(all_cases)}, Total problem cases: {len(problem_cases)}")
    for i, p in enumerate(problem_cases[:5]):
        print(f"  Problem #{i+1}: {p.get('email_id')} (id={p.get('id')}, state={p.get('state')})")

    assert len(problem_cases) >= 3, "Need at least 3 problem cases to verify"

    first_prob = problem_cases[0]
    second_prob = problem_cases[1]
    third_prob = problem_cases[2]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        # 1. Navigate to first problem case
        print(f"\n[1] Navigating to first problem case: /cases/{first_prob['id']} ({first_prob['email_id']})")
        await page.goto(f"http://localhost:5173/cases/{first_prob['id']}", wait_until="networkidle")
        await page.wait_for_selector(".btn-next-case", timeout=10000)
        # Wait a moment for background list cases to settle
        await page.wait_for_timeout(1000)

        path1 = os.path.join(ARTIFACTS_DIR, "next_case_step1_first_problem.png")
        await page.screenshot(path=path1)
        print(f"Captured: {path1}")

        # Check button title
        next_btn = page.locator(".btn-next-case")
        title_attr = await next_btn.get_attribute("title")
        print(f"Next case button title: '{title_attr}'")

        # 2. Click Next case button
        print(f"\n[2] Clicking 'Next case' button (expecting {second_prob['email_id']})...")
        curr_url = page.url
        await next_btn.click()
        await page.wait_for_function(f"window.location.href !== '{curr_url}'", timeout=10000)
        await page.wait_for_selector(".btn-next-case", timeout=10000)
        await page.wait_for_timeout(800)

        new_url = page.url
        print(f"Navigated to: {new_url}")
        assert second_prob["id"] in new_url, f"Expected second problem case {second_prob['id']} ({second_prob['email_id']}), but got {new_url}"
        print(f"PASSED! Successfully jumped from {first_prob['email_id']} to {second_prob['email_id']}, skipping checked cases in between!")

        path2 = os.path.join(ARTIFACTS_DIR, "next_case_step2_second_problem.png")
        await page.screenshot(path=path2)
        print(f"Captured: {path2}")

        # 3. Click Next case button again
        print(f"\n[3] Clicking 'Next case' button again (expecting {third_prob['email_id']})...")
        curr_url2 = page.url
        await next_btn.click()
        await page.wait_for_function(f"window.location.href !== '{curr_url2}'", timeout=10000)
        await page.wait_for_selector(".btn-next-case", timeout=10000)
        await page.wait_for_timeout(800)

        new_url2 = page.url
        print(f"Navigated to: {new_url2}")
        assert third_prob["id"] in new_url2, f"Expected third problem case {third_prob['id']} ({third_prob['email_id']}), but got {new_url2}"
        print(f"PASSED! Successfully jumped from {second_prob['email_id']} to {third_prob['email_id']}, skipping checked cases in between!")

        path3 = os.path.join(ARTIFACTS_DIR, "next_case_step3_third_problem.png")
        await page.screenshot(path=path3)
        print(f"Captured: {path3}")

        await browser.close()
        print("\nAll next problem case navigation tests passed with 100% success!")

if __name__ == "__main__":
    asyncio.run(main())
