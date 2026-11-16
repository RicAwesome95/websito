#!/usr/bin/env node
// Imports page content from the live site into content/.
// Usage: node scripts/import.mjs [--cache <dir>]   (cache dir holds raw HTML so re-runs are offline)
import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { ORIGIN, slugFor } from './lib.mjs';

const args = process.argv.slice(2);
const cacheDir = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : '.cache/original';
const UA = 'Mozilla/5.0 (site-import)';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function routes() {
  const index = await get(`${ORIGIN}/sitemap.xml`);
  const maps = [...index.matchAll(/<loc>([^<]+)/g)].map((m) => m[1]);
  const all = new Set(['/']);
  for (const m of maps) {
    const xml = await get(m);
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)/g)) all.add(new URL(loc).pathname.replace(/\/$/, '') || '/');
  }
  return [...all].sort();
}

async function raw(route) {
  const file = path.join(cacheDir, slugFor(route) + '.html');
  try { return await fs.readFile(file, 'utf8'); } catch {}
  const html = await get(ORIGIN + route);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(file, html);
  return html;
}

// Inline styles the original uses as "before animation" states. We drop them and
// tag the element so src/site.js can replay an equivalent reveal.
function cleanStyle($, el) {
  const style = el.attribs.style;
  if (!style) return;
  const keep = [];
  for (const decl of style.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [prop, ...rest] = decl.split(':');
    const value = rest.join(':').trim();
    if (prop === 'clip-path' && value.startsWith('inset(')) { el.attribs['data-reveal'] = 'clip'; continue; }
    if (prop === 'transform' && /^translateY\(/.test(value)) { el.attribs['data-reveal'] = 'rise'; continue; }
    if (prop === 'transform' && /^scaleX\(0\)/.test(value)) { el.attribs['data-reveal'] = 'scale-x'; continue; }
    if (prop === 'transform-origin' && el.attribs['data-reveal'] === 'scale-x') continue;
    if (prop === 'will-change') continue;
    if (prop === 'opacity' && value === '0') { el.attribs['data-reveal'] ??= 'fade'; continue; }
    keep.push(`${prop}:${value}`);
  }
  if (keep.length) el.attribs.style = keep.join(';'); else delete el.attribs.style;
}

function clean($, root) {
  root.find('script, noscript, template, link, style').remove();
  root.find('*').addBack().contents().filter((_, n) => n.type === 'comment').remove();
  root.find('*').addBack().each((_, el) => {
    if (el.type !== 'tag') return;
    cleanStyle($, el);
    for (const a of ['data-nimg', 'fetchpriority', 'decoding']) delete el.attribs[a];
  });
  return root;
}

const html = (node) => cheerio.load('', null, false).html(node).replace(/\n\s*\n/g, '\n');

const list = await routes();
await fs.rm('content/pages', { recursive: true, force: true });
await fs.mkdir('content/pages', { recursive: true });
await fs.mkdir('content/shell', { recursive: true });
const pages = [];

for (const route of list) {
  const $ = cheerio.load(await raw(route));
  const meta = (sel) => $(sel).attr('content') || '';
  const content = $('.frontend-content').children().first();
  if (!content.length) { console.warn('no content', route); continue; }
  clean($, content);
  const slug = slugFor(route);
  await fs.writeFile(`content/pages/${slug}.html`, html(content) + '\n');
  pages.push({
    route, slug,
    title: $('title').first().text(),
    description: meta('meta[name="description"]'),
    ogImage: meta('meta[property="og:image"]'),
    robots: meta('meta[name="robots"]'),
  });

  if (route === '/about') {
    const nav = clean($, $('body > nav').first());
    const menu = clean($, $('#navigation-menu'));
    menu.find('[aria-current]').removeAttr('aria-current').removeClass('active-menu-link text-active');
    menu.removeAttr('style');
    const footer = clean($, $('footer').first());
    const homeLogo = clean($, $('.homepage-footer-logo').first());
    await fs.writeFile('content/shell/nav.html', html(nav) + '\n');
    await fs.writeFile('content/shell/menu.html', html(menu) + '\n');
    await fs.writeFile('content/shell/footer.html', html(footer) + '\n');
    await fs.writeFile('content/shell/home-footer-logo.html', html(homeLogo) + '\n');
  }
}
await fs.writeFile('content/pages.json', JSON.stringify(pages, null, 2) + '\n');
console.log(`imported ${pages.length} pages`);
