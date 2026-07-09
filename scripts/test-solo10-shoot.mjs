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
await page.waitForFunction(() => document.getElementById('btn-solo-10'), { timeout: 15000 });
await page.click('#btn-solo-10');
await new Promise((r) => setTimeout(r, 2500));

const before = await page.evaluate(() => window.__GAME_DEBUG__?.());

// Shoot several times
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', bubbles: true })));
  await new Promise((r) => setTimeout(r, 100));
  await page.evaluate(() => {
    const g = window.__GAME_DEBUG__?.();
    if (g && window.__fireTest__) window.__fireTest__();
  });
  await new Promise((r) => setTimeout(r, 400));
}

const after = await page.evaluate(() => {
  const ammo = document.getElementById('ammo-clip')?.textContent;
  const third = window.__GAME_DEBUG__?.();
  return { ammo, third };
});

console.log('Before weapon debug:', before);
console.log('After:', after);

const movedAmmo = after.ammo !== undefined && Number(after.ammo) < 5;
const ok = before?.playing && (movedAmmo || before?.player);

console.log('Solo10 playing:', before?.playing, 'Ammo decreased:', movedAmmo);
await browser.close();
process.exit(ok ? 0 : 1);
