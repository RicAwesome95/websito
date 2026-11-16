import { initSmoothScroll, ScrollTrigger } from './core.js';
import { initMenu } from './nav.js';
import * as blocks from './blocks.js';

initSmoothScroll();
initMenu();
for (const init of Object.values(blocks)) {
  try { init(); } catch (error) { console.error(error); }
}
addEventListener('load', () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());
