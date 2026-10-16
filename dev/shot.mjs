/*
 * Screenshot tool. Starts its own Vite server on a free port (safe to run several at once).
 *
 *   node dev/shot.mjs --m torii --out shots/torii.png [--cam 0,1.55,13.5] [--target 0,2.6,0]
 *                     [--t 3] [--post] [--grid] [--blood 1] [--opts '{"torii":{}}'] [--w 1440] [--h 900]
 *   node dev/shot.mjs --page / --out shots/site.png [--scroll 1200] [--wait 2500] [--w 1440] [--h 900]
 *
 * Prints console errors; exits 1 if the page threw.
 */
import { createServer } from 'vite';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[k] = true;
  else (args[k] = next), i++;
}

const out = resolve(args.out ?? 'shot.png');
mkdirSync(dirname(out), { recursive: true });
const width = Number(args.w ?? 1440);
const height = Number(args.h ?? 900);

const cacheDir = mkdtempSync(join(tmpdir(), 'vite-shot-'));
const server = await createServer({
  root,
  cacheDir,
  logLevel: 'error',
  server: { port: 0, strictPort: false, hmr: false },
});
await server.listen();
const port = server.httpServer.address().port;

let url;
if (args.page) {
  url = `http://localhost:${port}${args.page}`;
} else {
  const p = new URLSearchParams();
  for (const k of ['m', 'cam', 'target', 't', 'blood', 'opts']) if (args[k] !== undefined) p.set(k, args[k]);
  if (args.post) p.set('post', '1');
  if (args.grid) p.set('grid', '1');
  if (args.q) p.set('q', args.q);
  url = `http://localhost:${port}/dev/harness.html?${p}`;
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(args.dpr ?? 1) });
const errors = [];
let threw = false;
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => {
  threw = true;
  errors.push(`[pageerror] ${e.message}`);
});

try {
  await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
  if (args.page) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(Number(args.wait ?? 2500));
    if (args.scroll) {
      await page.evaluate((y) => window.scrollTo(0, y), Number(args.scroll));
      await page.waitForTimeout(Number(args.settle ?? 1500));
    }
  } else {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 }).catch(() => {
      errors.push('[timeout] harness never set window.__ready');
    });
    await page.waitForTimeout(Number(args.wait ?? 300));
    const stats = await page.evaluate(() => window.__stats);
    if (stats) console.log(`draw calls: ${stats.calls}, triangles: ${stats.triangles}`);
  }
  await page.screenshot({ path: out });
  console.log(`saved ${out}`);
} catch (e) {
  threw = true;
  errors.push(`[shot] ${e.message}`);
} finally {
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
}
process.exit(threw ? 1 : 0);
