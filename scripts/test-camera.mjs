import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:3000';
const chrome = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

page.on('console', (msg) => {
  if (msg.text().includes('FPS') || msg.text().includes('Spectator')) {
    console.log('PAGE:', msg.text());
  }
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });

// Expose game state reader via evaluate after modules load
await page.waitForFunction(() => document.getElementById('btn-solo-10'), { timeout: 15000 });

await page.click('#btn-solo-10');
await new Promise((r) => setTimeout(r, 4000));

const info = await page.evaluate(() => {
  const hud = document.getElementById('game-hud');
  const hudVisible = hud && !hud.classList.contains('hidden');
  const timer = document.getElementById('timer-display')?.textContent || '';
  const debug = window.__GAME_DEBUG__ ? window.__GAME_DEBUG__() : null;
  return { hudVisible, timer, debug };
});

console.log('HUD info:', JSON.stringify(info, null, 2));

const ok = info.debug && info.debug.camWorldY < 6 && info.debug.playing && info.debug.lookDir?.y > -0.3;
console.log('FPS camera OK:', ok, '(worldY=', info.debug?.camWorldY, 'lookY=', info.debug?.lookDir?.y, ')');

await page.screenshot({ path: '/tmp/game-test.png' });
console.log('Screenshot: /tmp/game-test.png');

await browser.close();
process.exit(ok ? 0 : 1);
