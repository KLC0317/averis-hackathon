import asyncio
from playwright.async_api import async_playwright

async def check():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1536, 'height': 900})
        await page.goto('http://localhost:5173/inbox', wait_until='networkidle')
        print('Page loaded')
        
        # Check collapse button
        btn = page.locator('.sidebar-toggle-btn')
        print('Sidebar toggle btn count:', await btn.count())
        if await btn.count() > 0:
            box = await btn.bounding_box()
            print('Sidebar toggle btn box:', box)
            await btn.click()
            await page.wait_for_timeout(300)
            collapsed = await page.locator('.sidebar-collapsed').count()
            print('Is sidebar collapsed after click:', collapsed)
            
            # Check width of sidebar and main
            sidebar_box = await page.locator('.sidebar').bounding_box()
            main_box = await page.locator('.main').bounding_box()
            print('Collapsed sidebar box:', sidebar_box)
            print('Collapsed main box:', main_box)
            
            # Now click expand button
            expand_btn = page.locator('.sidebar-rail-header-btn')
            print('Expand btn count:', await expand_btn.count())
            if await expand_btn.count() > 0:
                await expand_btn.click()
                await page.wait_for_timeout(300)
                collapsed2 = await page.locator('.sidebar-collapsed').count()
                print('Is sidebar collapsed after expand click (should be 0):', collapsed2)
                sidebar_box2 = await page.locator('.sidebar').bounding_box()
                main_box2 = await page.locator('.main').bounding_box()
                print('Expanded sidebar box:', sidebar_box2)
                print('Expanded main box:', main_box2)
                
        # Check nav items navigation latency and response
        nav_items = page.locator('.nav-item')
        print('Nav items count:', await nav_items.count())
        
        await browser.close()

if __name__ == '__main__':
    asyncio.run(check())
