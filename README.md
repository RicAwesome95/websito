# websito

A static remake of [thecontenders.co](https://thecontenders.co): every page in the original's
sitemap (62), rebuilt as plain HTML, one stylesheet and one script, with no framework or
server at runtime.

```bash
npm install
npm run build     # content/ + src/  ->  dist/
npm run serve     # http://localhost:4173
npm run report    # compare dist/ with the live original -> report/REPORT.md
```

## Deploying

`netlify.toml` holds the Netlify settings: build command `npm run build`, publish folder
`dist`, Node 22. It also sends a `noindex` header so search engines don't index the copy;
remove that block if the deployment should be indexed. Any host that serves a folder from
the domain root works the same way.

## How it is put together

| Path | What it is |
| --- | --- |
| `content/pages/*.html` | Page bodies, one file per route, imported from the original |
| `content/shell/` | Navbar, full-screen menu and footer shared by every page |
| `content/pages.json`, `content/filters.json` | Page metadata, and which items each archive filter matches |
| `src/styles.css` | Design tokens (colour themes, type scale, 4/8/18-column grid) and components, on Tailwind CSS v4 |
| `src/js/` | Interactions: `core` (GSAP, ScrollTrigger, Lenis), `blocks` (per-block behaviour), `pages` (articles, filters), `home` (intro artwork), `forms`, `nav` |
| `scripts/import.mjs` | Re-imports content from the live site (`npm run import`) |
| `scripts/build.mjs` | Builds `dist/` |
| `scripts/report.mjs`, `scripts/smoke.mjs` | The remake report and the interaction tests it runs |

To change a page, edit its file in `content/pages/`; to replace one wholesale, add
`src/pages/<slug>.html` and it takes precedence. Re-running the importer overwrites
`content/` with whatever the live site currently serves.

Build-time settings (environment variables):

- `SITE_URL` – canonical origin, e.g. `https://example.com`
- `FORM_ENDPOINT` – URL that accepts the newsletter and contact forms as JSON `POST`

## The report

`npm run report` builds the site, serves it locally and compares it with the live original.
It needs Playwright with Chromium available and network access to thecontenders.co.

For every page it checks that the page exists, that title, description, text, links and media
match, that internal links resolve, that every visible element sits within 3px of where the
original puts it at 1440px and 390px, and that no script errors occur. It then drives each
interactive widget once. The last line of `report/REPORT.md` is `REMAKE COMPLETE` only when
all of that passes.

## Differences from the original

These are deliberate and are not counted by the report.

- **Typefaces.** The original uses licensed fonts (Die Grotesk, Mesapholic, and iki Mono via
  Adobe Fonts) that are not redistributed here. The build falls back to Inter, Noto Serif
  Display (condensed) and JetBrains Mono. If you hold licences, drop
  `die-grotesk-roman.woff2`, `die-grotesk-italic.woff2`, `mesapholic-regular.woff2` and
  `mesapholic-italic.woff2` into `public/fonts/licensed/` (git-ignored) and rebuild; they are
  picked up automatically. The report measures layout with the original's fonts loaded on
  both sides.
- **Images, video and PDFs** are referenced from the original's media storage rather than
  copied into the repository.
- **Homepage artwork.** The original renders the intro with WebGL and a physics engine; this
  is a 2D canvas version of the same timeline, using the original's T, C and animal images:
  the symbol fades in, the letters fly in and collide over it, the symbol strobes through the
  animals and bursts into dots, then the letters drop and the headline appears (about four
  seconds). Clicking the empty hero afterwards replays it. The fluid distortion that follows
  the pointer on the original is not reproduced.
- **Forms.** There is no server. The newsletter and contact forms post to `FORM_ENDPOINT`
  when set and otherwise open the visitor's mail client. The contact note form's fields are
  this project's own design. Report downloads are direct links, without the original's
  sign-up gate, and there is no bot check.
- **Archive filters** run in the browser against data recorded at import time; the original
  filters on the server.
- **Left out:** analytics tags and the page-to-page transition animation.

## Rights

The text, imagery, marks and case studies belong to The Contenders. This repository rebuilds
their site's front end; make sure you have the right to publish that material before
deploying it anywhere public.
