import { initSmoothScroll, ScrollTrigger } from './core.js';
import { initMenu } from './nav.js';
import * as blocks from './blocks.js';
import * as pages from './pages.js';
import { initHome } from './home.js';

initSmoothScroll();
initMenu();
for (const init of [initHome, ...Object.values(blocks), ...Object.values(pages)]) {
  try { init(); } catch (error) { console.error(error); }
}
addEventListener('load', () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());
