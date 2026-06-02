// Visual verification helper: screenshot pages + capture console/network errors.
// Usage: node scripts/shoot.mjs <baseUrl> <path1> [path2 ...]
// Screenshots are written to /tmp/shots/ at desktop and mobile widths.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const [, , base = 'http://localhost:4321', ...paths] = process.argv;
const targets = paths.length ? paths : ['/'];
const outDir = '/tmp/shots';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

let totalErrors = 0;
for (const path of targets) {
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await ctx.newPage();
    const msgs = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        msgs.push(`[${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', (r) =>
      msgs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText ?? ''}`),
    );

    const url = base + path;
    const resp = await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const slug = path === '/' ? 'home' : path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    const file = `${outDir}/${slug}.${vp.name}.png`;
    await page.screenshot({ path: file, fullPage: true });

    const status = resp?.status() ?? 0;
    console.log(`\n=== ${url} [${vp.name}] status=${status} -> ${file}`);
    if (msgs.length) {
      totalErrors += msgs.length;
      msgs.forEach((m) => console.log('   ' + m));
    } else {
      console.log('   (no console errors/warnings)');
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`\nDONE. ${totalErrors} console issue(s) total.`);
process.exit(0);
