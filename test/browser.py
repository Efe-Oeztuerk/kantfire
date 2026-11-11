import asyncio, sys, json
from playwright.async_api import async_playwright
MODE = sys.argv[1] if len(sys.argv) > 1 else 'gungame'
NAME = sys.argv[2] if len(sys.argv) > 2 else 'browser1'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1280,'height':720})
        errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await pg.goto('http://localhost:3999/')
        await pg.wait_for_timeout(800)
        await pg.screenshot(path='/tmp/shots/01_auth.png')
        await pg.click('.tabs button[data-m=register]')
        await pg.fill('.n', NAME); await pg.fill('.p', 'geheim123')
        await pg.click('.go')
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path='/tmp/shots/02_menu.png')
        await pg.click(f'.mode-card[data-m={MODE}]')
        await pg.wait_for_timeout(5000)
        await pg.screenshot(path=f'/tmp/shots/03_{MODE}_ingame.png')
        # Bewegen + schießen per Tastatur/Maus simulieren
        await pg.keyboard.down('KeyW'); await pg.wait_for_timeout(1200); await pg.keyboard.up('KeyW')
        await pg.mouse.down(); await pg.wait_for_timeout(600); await pg.mouse.up()
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path=f'/tmp/shots/04_{MODE}_later.png')
        await pg.keyboard.down('Tab'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'/tmp/shots/05_{MODE}_score.png')
        await pg.keyboard.up('Tab')
        st = await pg.evaluate('() => { const g = window.kf.game; return g ? { fps: g.fps, self: g.self && {hp:g.self.hp, al:g.self.al, team:g.self.team}, pred: [g.pred.x,g.pred.y,g.pred.z].map(v=>+v.toFixed(2)), remotes: g.remotes.size, ph: g.g.ph } : null }')
        print('STATE', json.dumps(st))
        print('ERRORS', len(errs)); [print(' ', e[:300]) for e in errs[:15]]
        await b.close()
asyncio.run(main())
