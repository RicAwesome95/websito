#!/usr/bin/env node
// Interaction smoke test for the built site: drives each interactive widget once and
// fails on any broken expectation or uncaught error. Usage: node scripts/smoke.mjs <base-url> [shots-dir]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [base = 'http://localhost:4173', shots] = process.argv.slice(2);

export async function smoke(baseUrl, shotsDir) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  const check = (name, ok) => { if (!ok) failures.push(name); };
  const open = async (route) => { await page.goto(baseUrl + route, { waitUntil: 'load' }); await page.waitForTimeout(900); };
  // Scroll the way a reader does, so scroll-driven observers see every position.
  const scrollDown = (to) => page.evaluate(async (to) => {
    for (let y = scrollY; y < to; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
  }, to);
  const shot = async (name) => { if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png` }); };

  // Menu opens, labels itself, closes on Escape.
  await open('/about');
  await page.click('[aria-controls="navigation-menu"]');
  await page.waitForTimeout(400);
  check('menu opens', await page.isVisible('#navigation-menu a[href="/work"]'));
  check('menu toggle stays reachable', await page.locator('[aria-controls="navigation-menu"]').evaluate((el) => document.elementFromPoint(el.getBoundingClientRect().x + 5, el.getBoundingClientRect().y + 5)?.closest('button') === el));
  check('menu toggle reads CLOSE', (await page.textContent('[aria-controls="navigation-menu"] .type-link')) === 'CLOSE');
  check('menu marks current section', (await page.getAttribute('#navigation-menu a[href="/about"]', 'aria-current')) === 'page');
  // Newsletter form inside the menu.
  await page.click('#navigation-menu .reveal-form-button');
  await page.waitForTimeout(600);
  check('newsletter form reveals', await page.isVisible('#navigation-menu input[type="email"]'));
  await page.fill('#navigation-menu input[type="email"]', 'not-an-email');
  await page.press('#navigation-menu input[type="email"]', 'Enter');
  check('newsletter validates email', /valid email/i.test(await page.textContent('#navigation-menu [data-status]')));
  await shot('menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('menu closes on Escape', !(await page.isVisible('#navigation-menu a[href="/work"]')));

  // Approach: accordions open one at a time.
  await open('/approach');
  const buttons = page.locator('[data-block="ServiceDescriptionBlock"] button[aria-controls]');
  await buttons.nth(0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await buttons.nth(0).click();
  check('accordion opens', (await buttons.nth(0).getAttribute('aria-expanded')) === 'true');
  await buttons.nth(1).click();
  check('accordion is exclusive', (await buttons.nth(0).getAttribute('aria-expanded')) === 'false' && (await buttons.nth(1).getAttribute('aria-expanded')) === 'true');

  // Work: filtering by industry narrows the list and updates the URL.
  await open('/work');
  const total = await page.locator('[data-block="FeaturedWork"]:visible').count();
  await page.selectOption('select[name="industry"] >> nth=-1', 'sports');
  await page.waitForTimeout(400);
  const filtered = await page.locator('[data-block="FeaturedWork"]:visible').count();
  check('work filter narrows results', total > 1 && filtered === 1);
  check('work filter updates URL', page.url().includes('industry=sports'));
  await shot('work-filter');
  // Hover preview on the archive list.
  await open('/work');
  const row = page.locator('.work-archive-list__items > li').first();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await row.hover();
  await page.waitForTimeout(900);
  check('work list hover preview', (await page.locator('.work-archive-list__items ~ [aria-hidden="true"] img, .work-archive-list__items ~ [aria-hidden="true"] video').count()) > 0);

  // Case study: scrolling past the hero offers the "Details" tab.
  await open('/work/monash-ivf');
  await scrollDown(5000);
  await page.waitForTimeout(1200);
  check('details tab appears', (await page.getAttribute('[data-work-hero-details-tab]', 'aria-hidden')) === 'false');

  // Article: chapter label follows the reader.
  await open('/insights/articles/the-price-of-broken-promises');
  await scrollDown(await page.evaluate(() => document.documentElement.scrollHeight * 0.6));
  await page.waitForTimeout(1200);
  check('chapter indicator advances', (await page.textContent('.article-chapter-links > button .type-label-s')) !== 'Chapter 01');

  // Webinars: carousel advances.
  await open('/insights/webinars');
  const counter = '#latest-webinars article:not([inert]) [aria-live="polite"]:visible';
  const before = await page.locator(counter).first().textContent();
  await page.locator('#latest-webinars article:not([inert]) button[aria-label="Next webinar"]:visible').first().click();
  await page.waitForTimeout(900);
  check('carousel advances', (await page.locator(counter).first().textContent()) !== before);

  // Contact: quick note form reveals and validates.
  await open('/contact');
  await page.getByRole('button', { name: /quick note/i }).click();
  await page.waitForTimeout(600);
  check('contact form reveals', await page.isVisible('#note-message'));
  await page.getByRole('button', { name: /send note/i }).click();
  check('contact form validates', /enter your name/i.test(await page.textContent('main form [data-status]')));
  await shot('contact');

  // Homepage: the artwork lands on click and reveals the headline links.
  await open('/');
  await page.mouse.click(720, 450);
  await page.waitForTimeout(1500);
  check('homepage intro reveals', await page.isVisible('.homepage-intro-copy__desktop-links a[href="/work"]'));
  await page.hover('.homepage-intro-copy__desktop-links a[href="/work"]');
  await page.waitForTimeout(500);
  check('homepage hides other links on hover', (await page.locator('.homepage-intro-copy__desktop-links a[href="/about"]').evaluate((el) => getComputedStyle(el.parentElement).opacity)) === '0');
  check('homepage link swaps headline', (await page.locator('.homepage-intro-copy__desktop-state--active').first().getAttribute('class')).includes('--default') === false);
  await shot('home-hover');

  await browser.close();
  for (const e of new Set(errors)) failures.push(`uncaught error: ${e}`);
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = await smoke(base, shots);
  console.log(failures.length ? failures.map((f) => `FAIL ${f}`).join('\n') : 'all interaction checks passed');
  process.exitCode = failures.length ? 1 : 0;
}
