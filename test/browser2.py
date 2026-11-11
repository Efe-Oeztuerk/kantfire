import asyncio, sys, json
from playwright.async_api import async_playwright
MODE = sys.argv[1]; NAME = sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width':1280,'height':720})
        errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await pg.goto('http://localhost:3999/'); await pg.wait_for_timeout(600)
        await pg.click('.tabs button[data-m=register]'); await pg.fill('.n', NAME); await pg.fill('.p', 'geheim123'); await pg.click('.go')
        await pg.wait_for_timeout(1200)
        await pg.click(f'.mode-card[data-m={MODE}]'); await pg.wait_for_timeout(3500)
        await pg.evaluate('() => { window.kf.game.input.locked = true; }')
        ev = lambda js: pg.evaluate(js)
        if MODE.startswith('comp'):
            await pg.keyboard.press('KeyB'); await pg.wait_for_timeout(500)
            await pg.screenshot(path=f'/tmp/shots/10_{MODE}_buy.png')
            for item in ['kr47','vesthelm','he','smoke']:
                btn = pg.locator(f'.bi[data-i={item}]')
                if await btn.count(): await btn.click(); await pg.wait_for_timeout(250)
            await pg.keyboard.press('KeyB')
            await pg.evaluate('() => { window.kf.game.input.locked = true; }')
            await pg.wait_for_timeout(600)
            print('AFTER BUY', await ev('() => { const s = window.kf.game.self; return {money: s.$, w: s.w, ar: s.ar, hm: s.hm, gr: s.gr, cur: s.cur, ph: window.kf.game.g.ph} }'))
            await pg.wait_for_timeout(5000)  # Kaufphase abwarten
        if MODE == 'sniper':
            await pg.wait_for_timeout(4000)
            await pg.mouse.down(button='right'); await pg.wait_for_timeout(100); await pg.mouse.up(button='right'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'/tmp/shots/12_{MODE}_scope.png')
        before = await ev('() => { const g = window.kf.game; return {mag: g.predictedMag(), srv: g.currentInst()} }')
        await pg.mouse.down(); await pg.wait_for_timeout(700); await pg.mouse.up(); await pg.wait_for_timeout(700)
        after = await ev('() => { const g = window.kf.game; return {mag: g.predictedMag(), srv: g.currentInst(), pending: g.pending.length, shots: g.lw.shots.length} }')
        print('FIRE before', before, 'after', after)
        await pg.screenshot(path=f'/tmp/shots/11_{MODE}_fight.png')
        await pg.wait_for_timeout(6000)
        await pg.screenshot(path=f'/tmp/shots/13_{MODE}_later.png')
        print('STATE', await ev('() => { const g = window.kf.game; return {g: g.g, self: g.self && {hp: g.self.hp, al: g.self.al, $: g.self.$}} }'))
        print('ERRORS', len(errs)); [print(' ', e[:400]) for e in errs[:10]]
        await b.close()
asyncio.run(main())
