// Homepage intro: a full-screen artwork (the T and C letterforms tumbling around one of the
// discipline symbols). Clicking it — or simply waiting — "lands" the piece and reveals the
// headline and navigation over a darkened version of the same artwork.
import { $, $$, gsap, prefersReducedMotion } from './core.js';

const RED = '#ed0000';
const AUTO_REVEAL_MS = 4200;

function createArtwork(canvas, symbols) {
  const ctx = canvas.getContext('2d');
  const state = { landed: false, mix: 0, raf: 0, width: 0, height: 0, dpr: 1 };
  const symbol = symbols.length ? symbols[Math.floor(Math.random() * symbols.length)] : null;
  // Each letter drifts and spins slowly and is pulled back toward its home position.
  const letters = [
    { char: 'T', home: [0.3, 0.52], x: 0, y: 0, vx: 0.012, vy: -0.008, angle: -0.12, spin: 0.05 },
    { char: 'C', home: [0.74, 0.5], x: 0, y: 0, vx: -0.01, vy: 0.009, angle: 0.3, spin: -0.04 },
  ];
  let pointer = null;

  const resize = () => {
    const rect = canvas.parentElement.getBoundingClientRect();
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  };

  const draw = (time) => {
    const { width, height, dpr, mix } = state;
    const size = Math.min(width * 0.62, height * 1.05);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Before landing: black letters on red. After: near-black letters on black.
    const background = gsap.utils.interpolate(RED, '#000000', mix);
    const ink = gsap.utils.interpolate('#000000', '#1a1a1a', mix);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px DieGrotesk, "Inter Variable", Arial, sans-serif`;
    for (const letter of letters) {
      const [hx, hy] = letter.home;
      if (!prefersReducedMotion()) {
        letter.vx += (0 - letter.x) * 0.0006;
        letter.vy += (0 - letter.y) * 0.0006;
        if (pointer) {
          const dx = hx + letter.x - pointer.x / width;
          const dy = hy + letter.y - pointer.y / height;
          const d2 = dx * dx + dy * dy + 0.02;
          letter.vx += (dx / d2) * 0.00004;
          letter.vy += (dy / d2) * 0.00004;
        }
        letter.vx *= 0.995;
        letter.vy *= 0.995;
        letter.x += letter.vx * 0.016;
        letter.y += letter.vy * 0.016;
        letter.angle += letter.spin * 0.016 * (1 - mix * 0.7);
      }
      ctx.save();
      ctx.translate((hx + letter.x) * width, (hy + letter.y) * height);
      ctx.rotate(letter.angle + Math.sin(time / 2600 + hx * 6) * 0.05);
      ctx.fillStyle = ink;
      ctx.fillText(letter.char, 0, 0);
      ctx.restore();
    }

    if (symbol && symbol.complete && symbol.naturalWidth) {
      const s = Math.min(width, height) * 0.62;
      ctx.save();
      ctx.globalAlpha = 1 - mix;
      ctx.translate(width * 0.5, height * 0.5 + Math.sin(time / 1900) * 6);
      ctx.drawImage(symbol, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    state.raf = requestAnimationFrame(draw);
  };

  resize();
  addEventListener('resize', resize);
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  canvas.addEventListener('pointerleave', () => { pointer = null; });
  state.raf = requestAnimationFrame(draw);
  return {
    land() {
      if (state.landed) return;
      state.landed = true;
      for (const letter of letters) { letter.vx *= 3; letter.vy *= 3; }
      gsap.to(state, { mix: 1, duration: prefersReducedMotion() ? 0 : 0.6, ease: 'power2.out' });
    },
  };
}

export function initHome() {
  const page = $('.page--home');
  const hero = $('.hero-intro', page ?? document);
  if (!page || !hero) return;
  const copy = $('.homepage-intro-copy', hero);
  const canvas = $('.hero__artwork canvas', hero);
  const artwork = $('.hero__artwork', hero);

  // The symbol is tinted red and drawn between the letters.
  const symbols = $$('template[data-hero-symbol]').map((tpl) => {
    const svg = tpl.innerHTML.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" color="${RED}" fill="${RED}"`);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return img;
  });
  const art = canvas ? createArtwork(canvas, symbols) : null;

  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    art?.land();
    document.body.classList.add('hero--post-impact', 'hero--intro-complete');
    copy?.classList.add('homepage-intro-copy--visible');
    copy?.removeAttribute('style');
  };
  artwork?.addEventListener('click', reveal);
  addEventListener('keydown', reveal, { once: true });
  if (prefersReducedMotion() || sessionStorage.getItem('intro-seen')) reveal();
  else setTimeout(reveal, AUTO_REVEAL_MS);
  try { sessionStorage.setItem('intro-seen', '1'); } catch {}

  // Hovering a link swaps the headline for that section's statement and shows its photo.
  const states = $$('.homepage-intro-copy__desktop-state', hero);
  const images = $$('.homepage-intro-copy__hover-image', hero);
  const overlay = $('.homepage-intro-copy__image-stage-overlay', hero);
  const links = $$('.homepage-intro-copy__desktop-links .homepage-intro-link', hero);
  gsap.set(images, { autoAlpha: 0 });
  const activate = (index) => {
    states.forEach((el, i) => {
      const on = index === null ? i === 0 : i === index + 1;
      el.classList.toggle('homepage-intro-copy__desktop-state--active', on);
      el.setAttribute('aria-hidden', String(!on));
    });
    links.forEach((el, i) => {
      el.classList.toggle('homepage-intro-link--hovered', i === index);
      el.classList.toggle('homepage-intro-link--inactive', index !== null && i !== index);
    });
    const label = index === null ? null : $('a', links[index])?.textContent.trim();
    images.forEach((el) => gsap.to(el, { autoAlpha: el.dataset.hoverImage === label ? 1 : 0, duration: 0.3, overwrite: true }));
    if (overlay) gsap.to(overlay, { opacity: index === null ? 0 : 0.55, duration: 0.3, overwrite: true });
  };
  links.forEach((el, i) => {
    const a = $('a', el);
    a?.addEventListener('pointerenter', () => activate(i));
    a?.addEventListener('pointerleave', () => activate(null));
    a?.addEventListener('focus', () => activate(i));
    a?.addEventListener('blur', () => activate(null));
  });

  // On desktop the footer sits behind the hero and is uncovered as the page scrolls.
  const veil = $('.homepage-footer-reveal-overlay', hero);
  const onScroll = () => {
    const range = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const progress = Math.min(1, Math.max(0, scrollY / range));
    veil?.style.setProperty('--footer-reveal-overlay-opacity', String(progress * 0.5));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
