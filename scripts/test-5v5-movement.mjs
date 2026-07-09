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
await page.waitForFunction(() => document.getElementById('btn-bot-game'), { timeout: 15000 });

await page.click('#btn-bot-game');
await new Promise((r) => setTimeout(r, 5000));

const before = await page.evaluate(() => window.__GAME_DEBUG__?.());

for (let i = 0; i < 40; i++) {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })));
  await new Promise((r) => setTimeout(r, 40));
}
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })));

const after = await page.evaluate(() => window.__GAME_DEBUG__?.());

const moved = after?.player && before?.player &&
  (Math.abs(after.player.z - before.player.z) > 0.2 || Math.abs(after.player.x - before.player.x) > 0.2);
const fpsOk = after?.camWorldY < 6 && after?.playing;

console.log('Before:', JSON.stringify(before, null, 2));
console.log('After:', JSON.stringify(after, null, 2));
console.log('5v5 movement OK:', moved, 'FPS OK:', fpsOk);

await browser.close();
process.exit(moved && fpsOk ? 0 : 1);
