#!/usr/bin/env node
// Remake report: compares the built site (dist/) with the live original, page by page,
// and writes report/REPORT.md. The last line is the verdict:
//   REMAKE COMPLETE            every check passed on every page
//   REMAKE INCOMPLETE (n)      n pages still differ
//
// Usage: node scripts/report.mjs [--only /about,/work] [--widths 1440,390] [--skip-build]
//
// What is compared
//   1. Coverage   every URL in the original's sitemap exists in dist/
//   2. Content    title, description, visible text, links, images and embeds of every page
//   3. Links      every internal link in dist/ resolves to a built page
//   4. Layout     position and size of every visible text run, image, video and iframe,
//                 plus page height and background/nav colours, at each width
//   5. Runtime    no uncaught JavaScript errors
//
// Layout is measured with the same typefaces on both sides: the report serves the
// original's brand fonts to the remake for the duration of the run (nothing is written to
// disk) and blocks the original's Adobe Fonts kit on both, so differences are layout only.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as cheerio from 'cheerio';
import { ORIGIN, outFor } from './lib.mjs';
import { smoke } from './smoke.mjs';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const WIDTHS = (arg('--widths') || '1440,390').split(',').map(Number);
const ONLY = arg('--only')?.split(',');
const ATTEMPTS = 3;
const TOLERANCE = 3; // px
const UA = 'Mozilla/5.0 (remake-report)';

// ---------------------------------------------------------------- helpers
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy && !process.env.NODE_USE_ENV_PROXY) {
  // Re-run with Node's proxy support so fetch() works behind an HTTPS proxy.
  const { spawnSync } = await import('node:child_process');
  process.exit(spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } }).status ?? 1);
}
async function get(url, as = 'text') {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (error) { if (i >= 2) throw error; }
  }
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function originalRoutes() {
  const index = await get(`${ORIGIN}/sitemap.xml`);
  const all = new Set(['/']);
  for (const [, map] of index.matchAll(/<loc>([^<]+)/g)) {
    for (const [, loc] of (await get(map)).matchAll(/<loc>([^<]+)/g)) all.add(new URL(loc).pathname.replace(/\/$/, '') || '/');
  }
  return [...all].sort();
}

function serve(root) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, url);
    if (existsSync(file) && (await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    else if (!existsSync(file) && !path.extname(file)) file = path.join(root, url, 'index.html');
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(await fs.readFile(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

// ---------------------------------------------------------------- static content checks
// Text that only exists after client rendering on the original, or that is random per
// request there, is excluded on both sides.
function describe(html) {
  const $ = cheerio.load(html);
  const content = $('.frontend-content').children().first();
  content.find('script, style, noscript, template, [data-our-team-marquee]').remove();
  const text = norm(content.text());
  const links = [...new Set(content.find('a[href]').map((_, a) => a.attribs.href).get().filter((h) => !/sharing\/share-offsite|sharer\.php/.test(h)))].sort();
  const media = content.find('img[src], video source[src], video[src], iframe[src]').map((_, el) => el.attribs.src).get().sort();
  return {
    title: $('title').first().text(),
    description: $('meta[name="description"]').attr('content') || '',
    text, links, media,
    shell: norm($('#navigation-menu').text() + ' | ' + $('footer').first().text()),
  };
}
function contentIssues(original, remake) {
  const issues = [];
  for (const key of ['title', 'description', 'text', 'shell']) if (original[key] !== remake[key]) issues.push(`${key} differs`);
  for (const key of ['links', 'media']) {
    const missing = original[key].filter((v) => !remake[key].includes(v));
    const extra = remake[key].filter((v) => !original[key].includes(v));
    if (missing.length || extra.length) issues.push(`${key}: ${missing.length} missing, ${extra.length} extra`);
  }
  return issues;
}

// ---------------------------------------------------------------- layout snapshots
async function snapshot(context, base, route, width) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0].slice(0, 160)));
  try {
    await page.goto(base + route, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1500);
    if (route === '/') {
      // The homepage opens on an interactive artwork; both sides are compared after it lands.
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(2500);
        if (await page.evaluate(() => document.body.classList.contains('hero--post-impact'))) break;
        await page.mouse.click(width / 2, 450);
      }
      await page.mouse.move(2, 2);
      await page.waitForTimeout(2500);
    }
    await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { scrollTo(0, y); await wait(160); }
      scrollTo(0, document.documentElement.scrollHeight); await wait(400);
      scrollTo(0, 0); await wait(1300);
    });
    const data = await page.evaluate(() => {
      const root = document.querySelector('.frontend-content') || document.body;
      const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgb = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].join(','); };
      const items = [];
      const walk = (el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || el.inert) return;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) return;
        // Randomised per request on the original (card tilt) or time-driven (marquee).
        // The featured-work stage also rotates its media on a timer.
        if (el.matches('.article-card-wrapper, [data-our-team-marquee], [data-block="FeaturedWork"] .aspect-square.w-full > *')) return;
        const r = el.getBoundingClientRect();
        const box = { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
        if (['IMG', 'VIDEO', 'IFRAME'].includes(el.tagName)) {
          const src = el.tagName === 'VIDEO' ? '' : (el.currentSrc || el.src || '').split('/').pop().split('?')[0].replace(/-\d+x\d+(\.\w+)$/, '$1');
          items.push({ k: el.tagName.toLowerCase(), t: src, ...box });
        } else if (!el.classList.contains('material-symbols-outlined')) {
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
          if (own && r.width > 0 && r.height > 0) items.push({ k: 'text', t: own.slice(0, 80), ...box, fs: cs.fontSize, fw: cs.fontWeight, col: rgb(cs.color), op: +(+cs.opacity).toFixed(2) });
        }
        for (const child of el.children) walk(child);
      };
      walk(root);
      const nav = document.querySelector('nav[aria-label="Main navigation"]');
      return { height: document.documentElement.scrollHeight, bodyBg: rgb(getComputedStyle(document.body).backgroundColor), navBg: nav ? rgb(getComputedStyle(nav).backgroundColor) : '', items };
    });
    return { ...data, errors };
  } finally { await page.close(); }
}

function layoutIssues(o, m) {
  const issues = [];
  if (Math.abs(o.height - m.height) > TOLERANCE) issues.push(`page height ${o.height}px vs ${m.height}px`);
  if (o.bodyBg !== m.bodyBg) issues.push('body background differs');
  if (o.navBg !== m.navBg) issues.push('navbar background differs');
  let cursor = 0, missing = 0, moved = 0, styled = 0;
  const samples = [];
  for (const a of o.items) {
    let at = -1;
    for (let q = cursor; q < Math.min(m.items.length, cursor + 40); q++) if (m.items[q].k === a.k && m.items[q].t === a.t) { at = q; break; }
    if (at < 0) { missing++; if (samples.length < 3) samples.push(`missing ${a.k} "${a.t.slice(0, 32)}"`); continue; }
    const b = m.items[at];
    cursor = at + 1;
    const delta = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
    if (delta > TOLERANCE) { moved++; if (samples.length < 3) samples.push(`"${a.t.slice(0, 32)}" off by ${delta}px`); }
    else if (a.k === 'text' && (a.fs !== b.fs || a.fw !== b.fw || a.col !== b.col || a.op !== b.op)) { styled++; if (samples.length < 3) samples.push(`"${a.t.slice(0, 32)}" styled differently`); }
  }
  const extra = m.items.length - (o.items.length - missing);
  if (missing || moved || styled || extra) issues.push(`${o.items.length} elements: ${missing} missing, ${moved} displaced, ${styled} restyled, ${extra} extra (${samples.join('; ')})`);
  return issues;
}

// ---------------------------------------------------------------- run
if (!args.includes('--skip-build')) execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });

const routes = (await originalRoutes()).filter((r) => !ONLY || ONLY.includes(r));
const results = Object.fromEntries(routes.map((r) => [r, { coverage: [], content: [], links: [], layout: {}, runtime: [] }]));

// 1–3: coverage, content, links
const built = new Set();
for (const route of routes) if (existsSync(path.join('dist', outFor(route)))) built.add(route);
for (const route of routes) {
  const result = results[route];
  if (!built.has(route)) { result.coverage.push('page not built'); continue; }
  const remakeHtml = await fs.readFile(path.join('dist', outFor(route)), 'utf8');
  result.content = contentIssues(describe(await get(ORIGIN + route)), describe(remakeHtml));
  const $ = cheerio.load(remakeHtml);
  const broken = [...new Set($('a[href^="/"]').map((_, a) => a.attribs.href.split(/[?#]/)[0].replace(/\/$/, '') || '/').get())]
    .filter((href) => !existsSync(path.join('dist', outFor(href))) && !existsSync(path.join('dist', href)));
  if (broken.length) result.links.push(`broken internal links: ${broken.join(', ')}`);
}

// 4–5: layout and runtime, in a real browser
const { chromium } = require('playwright');
const { server, base } = await serve(path.resolve('dist'));
const browser = await chromium.launch();

// Brand fonts are fetched from the original once and served to the remake from memory.
const originalCss = await get(new URL(cheerio.load(await get(ORIGIN + '/'))('link[rel="stylesheet"][href*="/_next/"]').attr('href'), ORIGIN).href);
const faces = [...originalCss.matchAll(/@font-face\{font-family:(DieGrotesk|Mesapholic);src:url\(([^)]+)\)[^}]*font-weight:([^;}]+);font-style:(\w+)\}/g)];
const fontFiles = new Map();
let parityCss = '\n:root{--serif-stretch:normal;--font-mono:"iki-mono-variable",sans-serif}\n';
for (const [, family, src, weight, style] of faces) {
  const name = `${family}-${style}.woff2`;
  fontFiles.set(name, await get(new URL(src, new URL('/_next/static/chunks/x.css', ORIGIN)).href, 'buffer'));
  parityCss += `@font-face{font-family:"${family}";src:url(/__parity/${name}) format("woff2");font-weight:${weight};font-style:${style};font-display:block}\n`;
}

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
  await context.route(/use\.typekit\.net|p\.typekit\.net|googletagmanager\.com/, (r) => r.abort());
  await context.route(`${base}/__parity/*`, (r) => r.fulfill({ body: fontFiles.get(r.request().url().split('/').pop()), contentType: 'font/woff2' }));
  await context.route(`${base}/assets/site.css`, async (r) => {
    const response = await r.fetch();
    await r.fulfill({ response, body: (await response.text()) + parityCss });
  });

  const queue = routes.filter((r) => built.has(r));
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const route = queue.shift();
      let issues = [];
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          const [o, m] = await Promise.all([snapshot(context, ORIGIN, route, width), snapshot(context, base, route, width)]);
          issues = layoutIssues(o, m);
          if (m.errors.length) results[route].runtime = [...new Set(m.errors)];
        } catch (error) { issues = [`could not be measured: ${error.message.split('\n')[0]}`]; }
        if (!issues.length) break;
      }
      results[route].layout[width] = issues;
      process.stdout.write(issues.length ? 'x' : '.');
    }
  }));
  await context.close();
  process.stdout.write(` ${width}px\n`);
}
await browser.close();
// 6: interactions, each driven once on the remake
const interactionFailures = ONLY ? [] : await smoke(base);
server.close();

// ---------------------------------------------------------------- write up
const failed = (r) => r.coverage.length || r.content.length || r.links.length || r.runtime.length || Object.values(r.layout).some((l) => l.length);
const failing = routes.filter((r) => failed(results[r]));
const incomplete = failing.length + interactionFailures.length;
const count = (pick) => routes.filter((r) => !pick(results[r])).length;
const mark = (ok) => (ok ? 'pass' : '**FAIL**');
const lines = [
  '# Remake report',
  '',
  `Original: ${ORIGIN}  `,
  `Generated: ${new Date().toISOString()}  `,
  `Pages checked: ${routes.length}${ONLY ? ' (partial run)' : ''}`,
  '',
  '## Summary',
  '',
  '| Check | Passing pages |',
  '| --- | --- |',
  `| Coverage — page exists in the build | ${count((r) => r.coverage.length)}/${routes.length} |`,
  `| Content — title, description, text, links, media | ${count((r) => r.content.length)}/${routes.length} |`,
  `| Links — internal links resolve | ${count((r) => r.links.length)}/${routes.length} |`,
  ...WIDTHS.map((w) => `| Layout at ${w}px — every element within ${TOLERANCE}px | ${count((r) => r.layout[w]?.length || r.coverage.length)}/${routes.length} |`),
  `| Runtime — no JavaScript errors | ${count((r) => r.runtime.length)}/${routes.length} |`,
  `| Interactions — menu, forms, filters, accordions, carousel, intro | ${ONLY ? 'not run' : interactionFailures.length ? `**${interactionFailures.length} failing**` : 'all pass'} |`,
  '',
  '## Pages',
  '',
  `| Page | Content | Links | ${WIDTHS.map((w) => `${w}px`).join(' | ')} | Runtime |`,
  `| --- | --- | --- | ${WIDTHS.map(() => '---').join(' | ')} | --- |`,
  ...routes.map((route) => {
    const r = results[route];
    return `| \`${route}\` | ${mark(!r.content.length && !r.coverage.length)} | ${mark(!r.links.length)} | ${WIDTHS.map((w) => mark(!r.layout[w]?.length && !r.coverage.length)).join(' | ')} | ${mark(!r.runtime.length)} |`;
  }),
  '',
];
if (interactionFailures.length) lines.push('## Interaction failures', '', ...interactionFailures.map((f) => `- ${f}`), '');
if (failing.length) {
  lines.push('## Differences', '');
  for (const route of failing) {
    const r = results[route];
    lines.push(`### \`${route}\``, '');
    for (const issue of [...r.coverage, ...r.content, ...r.links]) lines.push(`- ${issue}`);
    for (const w of WIDTHS) for (const issue of r.layout[w] || []) lines.push(`- ${w}px: ${issue}`);
    for (const issue of r.runtime) lines.push(`- runtime error: ${issue}`);
    lines.push('');
  }
}
lines.push(
  '## Not covered by this report',
  '',
  'See “Differences from the original” in the README: the brand typefaces and form back end are',
  'not part of this repository, the homepage artwork is a 2D reinterpretation, and analytics',
  'tags were left out. Those are deliberate and are not counted here.',
  '',
  ONLY ? `PARTIAL RUN (${routes.length - failing.length}/${routes.length} pages match)` : incomplete ? `REMAKE INCOMPLETE (${incomplete})` : 'REMAKE COMPLETE',
  '',
);
await fs.mkdir('report', { recursive: true });
await fs.writeFile('report/REPORT.md', lines.join('\n'));
await fs.writeFile('report/report.json', JSON.stringify(results, null, 2) + '\n');
console.log(`\n${lines.at(-2)}\nreport/REPORT.md`);
process.exitCode = incomplete ? 1 : 0;
