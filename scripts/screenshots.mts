/**
 * Regenerates docs/screenshots/*.png from the sample stack. Run: npm run shots
 * Only ever talks to the default stack on 127.0.0.1:8420; every capture first asserts the Sample data banner is visible.
 */
import { chromium, type Locator, type Page } from 'playwright';

const BASE = 'http://127.0.0.1:8420';
const OUT = 'docs/screenshots';
const VIEWPORT = { width: 1440, height: 900 };
const MAX_HEIGHT = 1000;
const CHAT_QUESTION = 'What is my top 10 stock concentration?';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'light' });
await page.goto(BASE);
await page.getByRole('tab', { name: 'Stock Intersection' }).waitFor();

const banner = page.getByRole('note').filter({ hasText: 'Sample data' }).first();

async function assertBanner() {
  await banner.waitFor({ state: 'visible', timeout: 5000 });
}

/** Crop of one element with a copy of the banner on top, so the banner shows even when the element is far down the page. */
async function shootElement(name: string, target: Locator) {
  await assertBanner();
  await target.evaluate((el, html) => {
    const strip = document.createElement('div');
    strip.innerHTML = html;
    el.prepend(strip.firstElementChild!);
  }, await banner.evaluate((el) => el.outerHTML));
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    fullPage: true,
    clip: { x: box.x, y: box.y + scrollY, width: box.width, height: Math.min(box.height, MAX_HEIGHT) },
  });
  await target.evaluate((el) => el.firstElementChild!.remove());
  console.log(`wrote ${name}.png`);
}

function card(page: Page, title: string) {
  return page.locator('section', { has: page.getByRole('heading', { name: title, exact: true }) });
}

await page.getByRole('tab', { name: 'Prism View' }).click();
await card(page, 'Asset Allocation').waitFor();
await shootElement('prism-view-overview', page.getByRole('tabpanel'));
await shootElement('stock-analysis', card(page, 'Stock Analysis'));
await shootElement('bonds', card(page, 'Bond Analysis'));

await page.getByRole('tab', { name: 'Stock Intersection' }).click();
await page.getByRole('button', { name: 'Expand all' }).click();
await shootElement('stock-intersection', page.getByRole('tabpanel'));

await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole('button', { name: 'Ask AI' }).click();
await page.getByPlaceholder('Ask about your portfolio').fill(CHAT_QUESTION);
await page.getByRole('button', { name: 'Send' }).click();
await page.getByText(/^via /).waitFor({ timeout: 60000 });
await assertBanner();
await page.screenshot({ path: `${OUT}/ai-chat.png` });
console.log('wrote ai-chat.png');

await browser.close();
