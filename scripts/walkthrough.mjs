// End-to-end walkthrough against the production preview build.
// Operates every island as a user, checks every network request, tests a11y.
import { chromium } from 'playwright';

const BASE = 'http://localhost:4321/ai-literacy';
const browser = await chromium.launch();
const issues = [];
const net = [];

// Crawl every internal link reachable from the entry pages and assert 200.
{
  const page = await (await browser.newContext()).newPage();
  const seen = new Set();
  const queue = ['/ai-literacy/', '/ai-literacy/lessons'];
  const badLinks = [];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const resp = await page.goto(`http://localhost:4321${path}`, { waitUntil: 'domcontentloaded' });
    if (!resp || resp.status() >= 400) { badLinks.push(`${resp?.status()} ${path}`); continue; }
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    for (const h of hrefs) {
      if (h && h.startsWith('/ai-literacy') && !h.includes('#')) queue.push(h.replace(/\/$/, '') || h);
    }
  }
  console.log(`LINK CRAWL: visited ${seen.size} pages, ${badLinks.length} broken:`, badLinks.length ? badLinks : '(none)');
  await page.close();
}

async function track(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push(`[${tag}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => issues.push(`[${tag}] pageerror: ${e.message}`));
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 400) net.push(`[${tag}] ${s} ${r.url()}`);
  });
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

// 1) Landing
{
  const page = await ctx.newPage();
  await track(page, 'home');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const h1 = await page.locator('h1').first().innerText();
  console.log('HOME h1:', JSON.stringify(h1));
  await page.close();
}

// 2) Lessons index — confirm exactly 3 lessons, no stub
{
  const page = await ctx.newPage();
  await track(page, 'lessons');
  await page.goto(`${BASE}/lessons`, { waitUntil: 'networkidle' });
  const cards = await page.locator('main a[href^="/lessons/"]').count();
  const hasStub = (await page.content()).includes('Pipeline Stub');
  console.log('LESSONS cards:', cards, '| stub present:', hasStub);
  await page.close();
}

// 3) Lesson 1 — ContextWindowMeter: drag history past budget
{
  const page = await ctx.newPage();
  await track(page, 'lesson1');
  await page.goto(`${BASE}/lessons/context-engineering`, { waitUntil: 'networkidle' });
  const meter = page.locator('section[aria-label="Interactive context window meter"]');
  await meter.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('section[aria-label="Interactive context window meter"] input[type=range]').nth(2).fill('180000');
  await page.getByRole('radio', { name: 'Off' }).click();
  await page.waitForTimeout(200);
  const overflow = await meter.locator('p[aria-live]').innerText();
  console.log('LESSON1 meter overflow:', JSON.stringify(overflow.trim().slice(0, 70)));
  // prev/next
  const next = await page.locator('nav[aria-label="Lesson navigation"] a').last().innerText();
  console.log('LESSON1 next:', JSON.stringify(next.replace(/\s+/g, ' ').trim()));
  await page.close();
}

// 4) Lesson 2 — AgentLoop play + Playground run + copy button
{
  const page = await ctx.newPage();
  await track(page, 'lesson2');
  await page.goto(`${BASE}/lessons/tool-use-and-the-agent-loop`, { waitUntil: 'networkidle' });
  // agent loop: scroll + play
  const loop = page.locator('section[aria-label^="Interactive agent loop"]');
  await loop.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await loop.getByRole('button', { name: 'Next step' }).click();
  await loop.getByRole('button', { name: 'Next step' }).click();
  const loopDetail = await loop.locator('div[aria-live]').innerText();
  console.log('LESSON2 loop step:', JSON.stringify(loopDetail.replace(/\s+/g, ' ').trim().slice(0, 50)));
  // playground: run
  const play = page.locator('section[aria-label^="Interactive prompt"]');
  await play.scrollIntoViewIfNeeded();
  await play.getByRole('button', { name: 'Run' }).click();
  await page.waitForTimeout(6000);
  const transcript = await play.locator('[role=log]').innerText();
  console.log('LESSON2 playground has tool call:', transcript.includes('tool call'), '| has answer:', transcript.includes('umbrella'));
  // copy button on a code block
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const copyBtn = page.locator('.code-block [data-copy]').first();
  await copyBtn.scrollIntoViewIfNeeded();
  await copyBtn.click();
  await page.waitForTimeout(200);
  console.log('LESSON2 copy button label after click:', JSON.stringify(await copyBtn.innerText()));
  await page.close();
}

// 5) Lesson 3 — EvalScorer: toggle Output B → FAIL
{
  const page = await ctx.newPage();
  await track(page, 'lesson3');
  await page.goto(`${BASE}/lessons/evaluation-and-verification`, { waitUntil: 'networkidle' });
  const ev = page.locator('section[aria-label="Interactive evaluation scorer"]');
  await ev.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await ev.getByRole('radio', { name: 'Output B' }).click();
  await page.waitForTimeout(1600);
  const verdict = await ev.locator('span').filter({ hasText: /^(PASS|FAIL)$/ }).first().innerText();
  console.log('LESSON3 eval Output B verdict:', verdict);
  await page.close();
}

await ctx.close();

// 6) Reduced motion: autoplay should NOT start on the home loop
{
  const ctxRM = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctxRM.newPage();
  await track(page, 'reduced');
  await page.goto(`${BASE}/lessons/tool-use-and-the-agent-loop`, { waitUntil: 'networkidle' });
  const loop = page.locator('section[aria-label^="Interactive agent loop"]');
  await loop.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  const detail = await loop.locator('div[aria-live]').innerText();
  console.log('REDUCED-MOTION loop still at step (no autoplay):', JSON.stringify(detail.match(/step \d+\/\d+/)?.[0] ?? '?'));
  await ctxRM.close();
}

// 7) Mobile render
{
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctxM.newPage();
  await track(page, 'mobile');
  await page.goto(`${BASE}/lessons/context-engineering`, { waitUntil: 'networkidle' });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await page.evaluate(() => document.documentElement.clientWidth);
  console.log('MOBILE horizontal overflow:', scrollW > clientW + 1 ? `YES (${scrollW}>${clientW})` : 'none');
  await ctxM.close();
}

await browser.close();

console.log('\n=== NETWORK >=400 ===');
console.log(net.length ? net.join('\n') : '(none)');
console.log('\n=== CONSOLE/PAGE ISSUES ===');
console.log(issues.length ? issues.join('\n') : '(none)');
console.log(`\nRESULT: ${issues.length} console issues, ${net.length} bad responses`);
process.exit(0);
