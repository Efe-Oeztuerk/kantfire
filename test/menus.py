import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width':1280,'height':800})
        errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await pg.goto('http://localhost:3999/'); await pg.wait_for_timeout(600)
        await pg.click('.tabs button[data-m=login]'); await pg.fill('.n', 'web_c5b'); await pg.fill('.p', 'geheim123'); await pg.click('.go')
        await pg.wait_for_timeout(1200)
        for page in ['inventory','shop','profile','leaderboard','stats','settings','friends','servers']:
            await pg.click(f'.nav button[data-p={page}]'); await pg.wait_for_timeout(900)
            if page in ('inventory','profile','settings','servers','shop'): await pg.screenshot(path=f'/tmp/shots/30_{page}.png')
        # Inventar: Waffen-Skin-Tab + Ausrüsten
        await pg.click('.nav button[data-p=inventory]'); await pg.wait_for_timeout(500)
        await pg.click('.tabs button[data-t=finish]'); await pg.wait_for_timeout(700)
        await pg.screenshot(path='/tmp/shots/31_finish.png')
        # Shop-Kauf
        await pg.click('.nav button[data-p=shop]'); await pg.wait_for_timeout(700)
        btn = pg.locator('.items button:not([disabled])').first
        if await btn.count(): await btn.click(); await pg.wait_for_timeout(700)
        # Steuerung-Tab
        await pg.click('.nav button[data-p=settings]'); await pg.wait_for_timeout(400)
        await pg.click('.tabs button[data-t=controls]'); await pg.wait_for_timeout(400)
        await pg.screenshot(path='/tmp/shots/32_controls.png')
        print('ERRORS', len(errs)); [print(' ', e[:300]) for e in errs[:10]]
        await b.close()
asyncio.run(main())
