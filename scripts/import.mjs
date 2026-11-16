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
  const file = path.join(cacheDir, slugFor(route).replace(/[?=&%]/g, '_') + '.html');
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
    if (prop === 'clip-path' && value.startsWith('inset(')) { el.attribs['data-reveal'] = value.startsWith('inset(100%') ? 'clip-up' : 'clip-down'; continue; }
    if (prop === 'transform' && /^translateY\(/.test(value)) continue;
    if (prop === 'transform' && /^scaleX\(0\)/.test(value)) continue;
    if (prop === 'transform-origin') continue;
    if (prop === 'will-change') continue;
    if (prop === 'opacity' && value === '0') continue;
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

// Keep `&` and `>` literal inside class attributes so Tailwind can see arbitrary variants like [&>p]:mb-5.
const html = (node) => cheerio.load('', null, false).html(node)
  .replace(/\n\s*\n/g, '\n')
  .replace(/class="([^"]*)"/g, (m, c) => `class="${c.replace(/&amp;/g, '&').replace(/&gt;/g, '>')}"`);

// The page's serialized component props (Next.js flight payload), used for data that the
// original only renders on the client.
function payload(rawHtml) {
  let out = '';
  for (const m of rawHtml.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) out += JSON.parse(`"${m[1]}"`);
  return out;
}
function jsonAfter(text, marker, key) {
  const at = text.indexOf(marker);
  const start = at < 0 ? -1 : text.indexOf(`"${key}":`, at);
  if (start < 0) return null;
  let i = start + key.length + 3, depth = 0, inStr = false;
  const open = i;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) break; }
  }
  try { return JSON.parse(text.slice(open, i + 1)); } catch { return null; }
}

// The team photo marquee is client-rendered on the original; rebuild its items from page data.
function fillTeamMarquee($, rawHtml) {
  const marquee = $('[data-our-team-marquee]');
  if (!marquee.length) return;
  const images = jsonAfter(payload(rawHtml), 'OurTeamMarquee', 'images') || [];
  for (const item of images) {
    const img = item?.media?.image;
    const size = img?.sizes?.xlarge?.url ? img.sizes.xlarge : img;
    if (!size?.url) continue;
    marquee.append(`<div class="our-team-marquee__item h-auto shrink-0 w-46.25 md:w-79 lg:w-[max(19.75rem,25vw)]"><img alt="" class="block h-auto w-full" loading="lazy" src="${size.url}" width="${size.width}" height="${size.height}"></div>`);
  }
}

const list = await routes();
await fs.rm('content/pages', { recursive: true, force: true });
await fs.mkdir('content/pages', { recursive: true });
await fs.mkdir('content/shell', { recursive: true });
const pages = [];

for (const route of list) {
  const rawHtml = await raw(route);
  const $ = cheerio.load(rawHtml);
  fillTeamMarquee($, rawHtml);
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
// Archive filters are resolved on the server by the original. Record which items each
// option returns so the static build can filter on the client.
const filters = {};
for (const route of list) {
  const $ = cheerio.load(await raw(route));
  const selects = $('[data-block="ArchiveFilterControls"] select');
  if (!selects.length) continue;
  const seen = new Set();
  const hrefs = ($page) => [...new Set($page('.frontend-content a[href]').map((_, a) => a.attribs.href).get().filter((h) => h.startsWith(route + '/') && !h.slice(route.length + 1).includes('/')))];
  filters[route] = { all: hrefs($), options: {} };
  for (const select of selects.get()) {
    const name = select.attribs.name;
    if (seen.has(name)) continue;
    seen.add(name);
    filters[route].options[name] = {};
    for (const option of $(select).find('option').get()) {
      const value = option.attribs.value;
      if (!value) continue;
      const html = await raw(`${route}?${name}=${encodeURIComponent(value)}`);
      filters[route].options[name][value] = hrefs(cheerio.load(html));
    }
  }
}
await fs.writeFile('content/filters.json', JSON.stringify(filters, null, 2) + '\n');

await fs.writeFile('content/pages.json', JSON.stringify(pages, null, 2) + '\n');
console.log(`imported ${pages.length} pages`);
