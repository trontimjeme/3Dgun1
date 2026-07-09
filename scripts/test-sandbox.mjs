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

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
await page.waitForFunction(() => document.getElementById('btn-solo-test'), { timeout: 15000 });

await page.click('#btn-solo-test');
await new Promise((r) => setTimeout(r, 2500));

const before = await page.evaluate(() => window.__GAME_DEBUG__?.());

// Simulate WASD movement via keyboard
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 800));
await page.keyboard.up('KeyW');

const afterMove = await page.evaluate(() => window.__GAME_DEBUG__?.());

// Test reload button exists and controls enabled
const controlsOk = await page.evaluate(() => {
  const btn = document.getElementById('btn-reload');
  const fire = document.getElementById('btn-fire');
  const jump = document.getElementById('btn-jump');
  const hud = document.getElementById('game-hud');
  return {
    reload: !!btn,
    fire: !!fire,
    jump: !!jump,
    hudVisible: hud && !hud.classList.contains('hidden'),
    touchVisible: !document.getElementById('touch-controls')?.classList.contains('hidden'),
  };
});

console.log('Before:', JSON.stringify(before, null, 2));
console.log('After move:', JSON.stringify(afterMove, null, 2));
console.log('Controls:', JSON.stringify(controlsOk, null, 2));

const moved = afterMove?.player && before?.player &&
  (Math.abs(afterMove.player.z - before.player.z) > 0.05 || Math.abs(afterMove.player.x - before.player.x) > 0.05);

const fpsOk = afterMove?.camWorldY < 6 && afterMove?.playing && afterMove?.sandboxMode;
const hudOk = controlsOk.hudVisible && controlsOk.reload && controlsOk.fire && controlsOk.jump;
const ok = fpsOk && hudOk && moved && afterMove?.controlsEnabled;

console.log('Sandbox FPS OK:', fpsOk);
console.log('HUD/controls OK:', hudOk);
console.log('Movement OK:', moved);
console.log('Overall:', ok);

await page.screenshot({ path: '/tmp/sandbox-test.png' });
console.log('Screenshot: /tmp/sandbox-test.png');

await browser.close();
process.exit(ok ? 0 : 1);
