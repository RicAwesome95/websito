import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const MOTION = '(prefers-reduced-motion: no-preference)';
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Smooth scrolling, driven from GSAP's ticker so ScrollTrigger stays in sync.
export let lenis = null;
export function initSmoothScroll() {
  if (prefersReducedMotion()) return;
  lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

export function scrollToY(target) {
  if (lenis) lenis.scrollTo(target, { duration: 1.2 });
  else if (typeof target === 'number') window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
  else target.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
}

// Runs `setup` only while motion is allowed (and the optional media query matches);
// GSAP reverts everything created inside when the query stops matching.
export function withMotion(setup, query) {
  const mm = gsap.matchMedia();
  mm.add(query ? `${query} and ${MOTION}` : MOTION, setup);
  return mm;
}

// Debounced ScrollTrigger refresh when an element's size changes.
export function refreshOnResize(el) {
  let timer;
  const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => ScrollTrigger.refresh(true), 100); });
  ro.observe(el);
  return () => { ro.disconnect(); clearTimeout(timer); };
}

// Collapsible panel used across the site: a <button aria-controls> and a grid panel
// that animates between grid-rows-[0fr] and grid-rows-[1fr].
export function setPanel(button, open) {
  const panel = document.getElementById(button.getAttribute('aria-controls'));
  if (!panel) return;
  button.setAttribute('aria-expanded', String(open));
  panel.setAttribute('aria-hidden', String(!open));
  panel.inert = !open;
  panel.classList.toggle('grid-rows-[1fr]', open);
  panel.classList.toggle('grid-rows-[0fr]', !open);
  const inner = panel.firstElementChild;
  inner?.classList.toggle('opacity-100', open);
  inner?.classList.toggle('opacity-0', !open);
  const icon = $('.material-symbols-outlined', button);
  if (icon && /^(add|remove)$/.test(icon.textContent.trim())) icon.textContent = open ? 'remove' : 'add';
  const img = $('img', button);
  if (img && /(plus|minus)\.svg/.test(img.getAttribute('src'))) img.setAttribute('src', img.getAttribute('src').replace(/(plus|minus)\.svg/, open ? 'minus.svg' : 'plus.svg'));
}
export const isPanelOpen = (button) => button.getAttribute('aria-expanded') === 'true';
