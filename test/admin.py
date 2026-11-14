import asyncio, os
SECRET = os.environ['KF_SECRET']  # das geheime Wort steht absichtlich nicht im Repo
from playwright.async_api import async_playwright
async def login(b, name, url='http://localhost:3998/'):
    pg = await b.new_page(viewport={'width':1440,'height':860})
    errs = []
    pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(url); await pg.wait_for_timeout(600)
    await pg.click('.tabs button[data-m=login]'); await pg.fill('.n', name); await pg.fill('.p', 'geheim123'); await pg.click('.go')
    await pg.wait_for_timeout(2000)
    return pg, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        # Nicht-Admin: nichts darf passieren
        pg, errs = await login(b, 'Spieler1')
        await pg.keyboard.type(SECRET); await pg.wait_for_timeout(800)
        print('nonadmin panel visible:', await pg.locator('.adm').count())
        await pg.close()
        # Admin: Tastenfolge im Menü
        pg, errs = await login(b, 'Chef')
        await pg.keyboard.type(SECRET); await pg.wait_for_timeout(800)
        print('admin panel visible:', await pg.locator('.adm').count())
        await pg.screenshot(path='/tmp/shots/60_admin_empty.png')
        await pg.fill('.adm .nm', 'Chef'); await pg.click('.adm .ld'); await pg.wait_for_timeout(700)
        await pg.click('.adm .q[data-c="10000"]'); await pg.wait_for_timeout(900)
        await pg.screenshot(path='/tmp/shots/61_admin_account.png')
        print('chrome coins:', await pg.locator('.coins').first.inner_text())
        await pg.click('.adm-tabs button[data-tab=rep]'); await pg.wait_for_timeout(700)
        await pg.screenshot(path='/tmp/shots/62_admin_reports.png')
        await pg.click('.adm-tabs button[data-tab=ov]'); await pg.wait_for_timeout(700)
        await pg.screenshot(path='/tmp/shots/63_admin_overview.png')
        await pg.click('.adm .x'); await pg.wait_for_timeout(300)
        # In ein Eingabefeld getippt (Freunde-Suche o. ä.)
        await pg.click('.nav button[data-p=friends]'); await pg.wait_for_timeout(900)
        inp = pg.locator('input[type=text]:visible, input:not([type]):visible').first
        await inp.fill(''); await inp.type(SECRET); await pg.wait_for_timeout(800)
        print('panel via input field:', await pg.locator('.adm').count(), 'field value now:', repr(await inp.input_value()))
        print('ERRORS', len(errs)); [print(' ', e[:300]) for e in errs[:10]]
        await b.close()
asyncio.run(main())
