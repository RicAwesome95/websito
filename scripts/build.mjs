#!/usr/bin/env node
// Static build: content/ + src/ -> dist/
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { outFor } from './lib.mjs';

const SITE_URL = process.env.SITE_URL || '';
const read = (f) => fs.readFile(f, 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const pages = JSON.parse(await read('content/pages.json'));
const shell = {
  nav: await read('content/shell/nav.html'),
  menu: await read('content/shell/menu.html'),
  footer: await read('content/shell/footer.html'),
  homeLogo: await read('content/shell/home-footer-logo.html'),
};

await fs.rm('dist', { recursive: true, force: true });
await fs.mkdir('dist/assets/fonts', { recursive: true });
if (existsSync('public')) await fs.cp('public', 'dist', { recursive: true });

// ---- fonts -----------------------------------------------------------------
const fonts = [
  ['Inter Variable', '100 900', 'normal', 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'],
  ['Inter Variable', '100 900', 'italic', 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2'],
  ['Noto Serif Display Variable', '100 900', 'normal', 'node_modules/@fontsource-variable/noto-serif-display/files/noto-serif-display-latin-wdth-normal.woff2', '62.5% 100%'],
  ['Noto Serif Display Variable', '100 900', 'italic', 'node_modules/@fontsource-variable/noto-serif-display/files/noto-serif-display-latin-wdth-italic.woff2', '62.5% 100%'],
  ['JetBrains Mono Variable', '100 800', 'normal', 'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'],
  ['Material Symbols Outlined', '400', 'normal', 'node_modules/material-symbols/material-symbols-outlined.woff2', null, 'block'],
];
// Optional licensed brand fonts: drop the files in public/fonts/licensed/ (git-ignored).
const licensed = [
  ['DieGrotesk', '100 900', 'normal', 'public/fonts/licensed/die-grotesk-roman.woff2'],
  ['DieGrotesk', '100 900', 'italic', 'public/fonts/licensed/die-grotesk-italic.woff2'],
  ['Mesapholic', '400', 'normal', 'public/fonts/licensed/mesapholic-regular.woff2'],
  ['Mesapholic', '400', 'italic', 'public/fonts/licensed/mesapholic-italic.woff2'],
];
let fontCss = '';
let hasBrandSerif = false;
for (const [family, weight, style, src, stretch, display] of fonts) {
  const name = path.basename(src);
  await fs.copyFile(src, `dist/assets/fonts/${name}`);
  fontCss += `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};${stretch ? `font-stretch:${stretch};` : ''}font-display:${display || 'swap'};src:url(/assets/fonts/${name}) format("woff2")}\n`;
}
for (const [family, weight, style, src] of licensed) {
  if (!existsSync(src)) continue;
  if (family === 'Mesapholic') hasBrandSerif = true;
  fontCss += `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};font-display:swap;src:url(/${src.replace('public/', '')}) format("woff2")}\n`;
}
// The stand-in serif is a width-axis variable font; the brand serif is natively condensed.
fontCss += `:root{--serif-stretch:${hasBrandSerif ? 'normal' : '62.5%'}}\n`;
// PARITY_FONTS=1 reproduces the original's exact label fallback so layout can be compared 1:1
// in environments where its Adobe Fonts kit is unreachable.
const parityCss = process.env.PARITY_FONTS ? `\n:root{--font-mono:"iki-mono-variable",sans-serif}\n` : '';

// ---- css / js --------------------------------------------------------------
execFileSync('npx', ['tailwindcss', '-i', 'src/styles.css', '-o', 'dist/assets/site.css', '--minify'], { stdio: ['ignore', 'ignore', 'inherit'] });
await fs.writeFile('dist/assets/site.css', fontCss + (await read('dist/assets/site.css')) + parityCss);
execFileSync('npx', ['esbuild', 'src/js/main.js', '--bundle', '--minify', '--format=iife', '--target=es2020', '--outfile=dist/assets/site.js', '--log-level=warning'], { stdio: 'inherit' });

// ---- pages -----------------------------------------------------------------
const section = (route) => '/' + (route.split('/')[1] || '');
function menuFor(route) {
  const current = section(route);
  return shell.menu.replace(/<a class="menu-link ([^"]*)" href="([^"]+)"/g, (m, cls, href) =>
    href === current ? `<a aria-current="page" class="menu-link ${cls} active-menu-link text-active" href="${href}"` : m);
}

// The navbar is black on dark and red pages, white everywhere else.
function navFor(body) {
  const m = body.match(/^<main[^>]*data-theme="([^"]+)"/);
  const theme = m && ['black', 'dark', 'red'].includes(m[1]) ? 'black' : 'white';
  return shell.nav.replace('data-theme="white"', `data-theme="${theme}"`);
}

function render(page, body) {
  const isHome = page.route === '/';
  const canonical = SITE_URL ? `<link rel="canonical" href="${esc(SITE_URL + (isHome ? '' : page.route))}">` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${page.robots ? `<meta name="robots" content="${esc(page.robots)}">` : ''}
${canonical}
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:type" content="website">
${page.ogImage ? `<meta property="og:image" content="${esc(page.ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
<script>document.documentElement.classList.add('js')</script>
<script src="/assets/site.js" defer></script>
</head>
<body${isHome ? ' class="is-home"' : ''}>
<a class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-white focus:p-2 focus:text-black" href="#content">Skip to content</a>
${navFor(body)}
${menuFor(page.route)}
<div class="frontend-content frontend-content--visible" id="content">
${body}
${shell.footer}
${isHome ? shell.homeLogo : ''}
</div>
</body>
</html>
`;
}

for (const page of pages) {
  const override = `src/pages/${page.slug}.html`;
  const body = await read(existsSync(override) ? override : `content/pages/${page.slug}.html`);
  const out = path.join('dist', outFor(page.route));
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, render(page, body));
}
await fs.writeFile('dist/404.html', render({ route: '/404', slug: '404', title: 'Page not found | The Contenders', description: '', robots: 'noindex' },
  `<main class="page" data-theme="black"><div class="page-content"><section class="container-full-width flex min-h-dvh flex-col justify-center gap-10 py-40"><h1 class="type-heading-l text-red">Page not found</h1><p class="type-heading-h5"><a class="underline" href="/">Back to the homepage</a></p></section></div></main>`));
console.log(`built ${pages.length} pages -> dist/`);
