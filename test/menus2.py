import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width':1440,'height':860})
        errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await pg.goto('http://localhost:3999/'); await pg.wait_for_timeout(600)
        await pg.click('.tabs button[data-m=register]'); await pg.fill('.n', 'Efe_Test'); await pg.fill('.p', 'geheim123'); await pg.click('.go')
        await pg.wait_for_timeout(2000)
        await pg.screenshot(path='/tmp/shots/40_play.png')
        for page in ['battlepass','inventory','shop','profile','leaderboard','stats','friends','servers','settings']:
            await pg.click(f'.nav button[data-p={page}]'); await pg.wait_for_timeout(1300)
            await pg.screenshot(path=f'/tmp/shots/41_{page}.png')
        await pg.click('.nav button[data-p=shop]'); await pg.wait_for_timeout(1000)
        await pg.click('.open[data-c=standard]'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path='/tmp/shots/42_crate_rolling.png')
        await pg.wait_for_timeout(3500)
        await pg.screenshot(path='/tmp/shots/43_crate_result.png')
        print('ERRORS', len(errs)); [print(' ', e[:300]) for e in errs[:10]]
        await b.close()
asyncio.run(main())
