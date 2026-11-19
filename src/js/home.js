// Homepage intro, following the original's timeline (seconds from page load):
//   0.35–1.25  the discipline symbol fades in, black on red
//   1.0        a huge T launches from one side and a C from the other, accelerating
//   ~1.6       impact: a flash, then the symbol strobes through the animals every 0.18s
//              (red and black swapping on alternate steps) and bursts into dots
//   +2.5       the letters drop, the screen fades to black and the headline appears
//   +3.6       intro complete
// Clicking the empty hero afterwards replays it with a different animal.
import { $, $$, gsap, prefersReducedMotion } from './core.js';

const RED = '#ed0000';
const ASSETS = '/assets/hero/';
// Sizes are fractions of the viewport, as in the original.
const ANIMALS = [
  { src: 'accounts.png', viewportWidth: 0.26, minViewportHeight: 0.77 },
  { src: 'business.png', viewportWidth: 0.26, minViewportHeight: 0.72 },
  { src: 'design.png', viewportWidth: 0.34, minViewportHeight: 0.66 },
  { src: 'strategy.png', viewportWidth: 0.4, minViewportHeight: 0.59 },
];
const T = { center: [0.43, 0.53], rotation: 0.18 };   // screen coordinates, y down
const C = { center: [0.59, 0.47], rotation: 0.16, startRotation: -0.16 };
const LAUNCH = 1.0;
const APPROACH = 0.6;
const FLASH = 0.08;
const STROBE_STEP = 0.18;
const STROBE_END = 0.8;
const DROP = 2.5;
const COMPLETE = 3.6;
const FADE = 0.8;

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const jitter = () => (Math.random() - 0.5) * Math.PI * 0.14;
const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

// A tinted copy of an alpha-mask image, cached per colour and size.
function tinter() {
  const cache = new Map();
  return (img, colour, w, h) => {
    const key = `${img.src}|${colour}|${Math.round(w)}x${Math.round(h)}`;
    let c = cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w));
      c.height = Math.max(1, Math.round(h));
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, c.width, c.height);
      cache.set(key, c);
    }
    return c;
  };
}

function createIntro(canvas, images, { onDrop, onComplete }) {
  const ctx = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  const tint = tinter();
  const noise = document.createElement('canvas');
  noise.width = noise.height = 160;
  const nctx = noise.getContext('2d');
  const noiseData = nctx.createImageData(160, 160);
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  let W = 0, H = 0, dpr = 1;
  let state;
  let raf = 0;
  let last = 0;
  let animal = Math.floor(Math.random() * ANIMALS.length);

  const resize = () => {
    const rect = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    for (const c of [canvas, layer]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    probe.width = Math.max(1, Math.round(W / 8));
    probe.height = Math.max(1, Math.round(H / 8));
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    if (state) state.dots = new Map();
  };

  const letterSize = (img, scale) => { const h = H * scale; return [h * (img.width / img.height), h]; };
  const tScale = () => (W < 768 ? 0.42 : W < 1024 ? 0.68 : 0.8);
  const cScale = () => (W < 768 ? 0.38 : W < 1024 ? 0.62 : 0.73);
  const animalSize = (index) => {
    const a = ANIMALS[index];
    const img = images.animals[index];
    const aspect = img.width / img.height;
    const k = W < 768 ? 0.58 : W < 1024 ? 0.78 : 1;
    const fraction = Math.max(a.viewportWidth, (a.minViewportHeight * aspect * H) / W) * k;
    const w = W * fraction;
    return [w, w / aspect];
  };

  // Five animals for the strobe: the starting one, then a different one each step.
  const sequence = (start) => {
    const seq = [start];
    while (seq.length < 5) {
      let next;
      do next = Math.floor(Math.random() * ANIMALS.length); while (next === seq.at(-1));
      seq.push(next);
    }
    return seq;
  };

  const start = (instant = false) => {
    const mobile = W < 1024;
    const [tw, th] = letterSize(images.t, tScale());
    const [cw, ch] = letterSize(images.c, cScale());
    const away = (w, h, sign) => {
      const r = Math.hypot(w, h) / 2;
      return mobile
        ? [sign * 0.1 * W, sign * (r + 0.45 * H) * (1 + 0.3 * Math.random())]
        : [sign * (r + 0.45 * W) * (1 + 0.3 * Math.random()), -sign * 0.25 * (r + 0.45 * H)];
    };
    const [tdx, tdy] = away(tw, th, -1);
    const [cdx, cdy] = away(cw, ch, 1);
    const tTarget = [T.center[0] * W, T.center[1] * H, T.rotation + jitter()];
    const cTarget = [C.center[0] * W, C.center[1] * H, C.rotation + jitter()];
    state = {
      time: 0,
      impactAt: null,
      seq: sequence(animal),
      width: W,
      dots: new Map(),
      dropped: false,
      completed: false,
      letters: [
        { img: images.t, w: tw, h: th, from: [tTarget[0] + tdx, tTarget[1] + tdy, T.rotation + jitter()], to: tTarget, push: [-1, 0.4], x: 0, y: 0, r: 0, vy: 0 },
        { img: images.c, w: cw, h: ch, from: [cTarget[0] + cdx, cTarget[1] + cdy, C.startRotation + jitter()], to: cTarget, push: [1, -0.4], x: 0, y: 0, r: 0, vy: 0 },
      ],
    };
    if (instant) {
      for (let p = 0; p <= 1; p += 0.02) { state.letters.forEach((l) => approach(l, p)); if (touching()) break; }
      hit();
      state.letters.forEach(settle);
      state.impactAt = 0;
      state.time = DROP + FADE + 1;
      state.dropped = true;
      state.completed = true;
      animal = state.seq[4];
    }
  };

  // Do the two letters touch? Drawn small: the T, then the C kept only where it covers the T.
  const touching = () => {
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.globalCompositeOperation = 'source-over';
    pctx.clearRect(0, 0, probe.width, probe.height);
    pctx.setTransform(1 / 8, 0, 0, 1 / 8, 0, 0);
    state.letters.forEach((l, i) => {
      pctx.globalCompositeOperation = i ? 'source-in' : 'source-over';
      pctx.save();
      pctx.translate(l.x, l.y);
      pctx.rotate(l.r);
      pctx.drawImage(l.img, -l.w / 2, -l.h / 2, l.w, l.h);
      pctx.restore();
    });
    const data = pctx.getImageData(0, 0, probe.width, probe.height).data;
    let hits = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 64 && ++hits > 2) return true;
    return false;
  };
  const approach = (l, p) => {
    const k = p ** 1.6; // accelerating, like the original's ramped approach speed
    l.x = l.from[0] + (l.to[0] - l.from[0]) * k;
    l.y = l.from[1] + (l.to[1] - l.from[1]) * k;
    l.r = l.from[2] + (l.to[2] - l.from[2]) * Math.min(1, p / 0.75);
  };
  const hit = () => { for (const l of state.letters) l.hit = [l.x, l.y, l.r]; };

  // Lowest point of a rotated letter, used to rest it on the bottom of the screen.
  const halfHeight = (l) => Math.abs((l.w / 2) * Math.sin(l.r)) + Math.abs((l.h / 2) * Math.cos(l.r));
  const settle = (l) => { l.y = H - halfHeight(l); };

  const step = (dt) => {
    const s = state;
    s.time += dt;
    const t = s.time;
    if (t < LAUNCH) { for (const l of s.letters) [l.x, l.y, l.r] = l.from; return; }
    if (s.impactAt === null) {
      // Fly in until the letters touch (or reach their marks).
      const p = Math.min(1, (t - LAUNCH) / APPROACH);
      s.letters.forEach((l) => approach(l, p));
      if (p >= 1 || touching()) { s.impactAt = t; hit(); }
      return;
    }
    const e = t - s.impactAt;
    for (const l of s.letters) {
      if (e < DROP) {
        // Recoil from the collision, then settle.
        const bounce = (e / 0.15) * Math.exp(1 - e / 0.15);
        l.x = l.hit[0] + l.push[0] * 0.03 * W * bounce;
        l.y = l.hit[1] + l.push[1] * 0.03 * H * bounce;
        l.r = l.hit[2] + l.push[0] * 0.04 * bounce;
        continue;
      }
      // Drop under gravity and rest on the bottom edge.
      if (!s.dropped) l.vy = 34;
      l.vy += 360 * dt;
      l.y += l.vy * dt;
      const floor = H - halfHeight(l);
      if (l.y > floor) { l.y = floor; l.vy = Math.abs(l.vy) > 60 ? -l.vy * 0.2 : 0; }
    }
    if (e >= DROP && !s.dropped) { s.dropped = true; animal = s.seq[4]; onDrop(); }
    if (e >= COMPLETE && !s.completed) { s.completed = true; onComplete(); }
  };

  const dotsFor = (index, w, h) => {
    const key = `${index}|${Math.round(w)}`;
    let dots = state.dots.get(key);
    if (dots) return dots;
    const src = tint(images.animals[index], '#000', w, h);
    const data = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    const cell = Math.max(4, Math.round(w / 70));
    dots = [];
    for (let y = cell / 2; y < src.height; y += cell) {
      for (let x = cell / 2; x < src.width; x += cell) {
        if (data[(Math.floor(y) * src.width + Math.floor(x)) * 4 + 3] > 110) dots.push([x - w / 2, y - h / 2, Math.random(), Math.random()]);
      }
    }
    dots.cell = cell;
    state.dots.set(key, dots);
    return dots;
  };

  const draw = () => {
    const s = state;
    const t = s.time;
    const e = s.impactAt === null ? -1 : t - s.impactAt;
    let strobe = null;
    let particles = 0;
    if (e >= 0 && e < FLASH) { strobe = 0; particles = Math.sin((e / FLASH) * Math.PI); }
    else if (e >= FLASH && e < STROBE_END) { strobe = Math.floor((e - FLASH) / STROBE_STEP) + 1; particles = Math.exp(-((e - FLASH) / (STROBE_END - FLASH)) * 6); }
    const swap = strobe !== null && strobe % 2 === 0;
    const backdrop = clamp01((e - DROP) / FADE);
    const current = strobe !== null ? s.seq[strobe] : e >= STROBE_END ? s.seq[4] : s.seq[0];
    const symbolOpacity = clamp01((t - 0.35) / 0.9) * (1 - backdrop);
    const bg = swap ? '#000000' : gsap.utils.interpolate(RED, '#000000', backdrop);
    const ink = swap ? RED : '#000000';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Symbol and letters share a layer; where they overlap, XOR knocks the ink out.
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'source-over';
    if (symbolOpacity > 0.001) {
      const [aw, ah] = animalSize(current);
      lctx.globalAlpha = symbolOpacity;
      lctx.save();
      lctx.translate(W / 2, H / 2);
      if (particles > 0.03) {
        const dots = dotsFor(current, aw, ah);
        const cx = 0.02 * W;
        lctx.fillStyle = ink;
        for (const [x, y, a, b] of dots) {
          const len = Math.hypot(x - cx, y) || 1;
          const push = particles * (25 + 90 * a);
          const r = dots.cell * 0.5 * (1 - particles * 0.55 * b);
          lctx.beginPath();
          lctx.arc(x + ((x - cx) / len) * push, y + (y / len) * push, r, 0, Math.PI * 2);
          lctx.fill();
        }
      } else {
        lctx.drawImage(tint(images.animals[current], ink, aw, ah), -aw / 2, -ah / 2, aw, ah);
      }
      lctx.restore();
    }
    lctx.globalAlpha = 1;
    lctx.globalCompositeOperation = 'xor';
    if (backdrop < 1) {
      for (const l of s.letters) {
        lctx.save();
        lctx.translate(l.x, l.y);
        lctx.rotate(l.r);
        lctx.drawImage(tint(l.img, ink, l.w, l.h), -l.w / 2, -l.h / 2, l.w, l.h);
        lctx.restore();
      }
    }
    ctx.globalAlpha = 1 - backdrop;
    ctx.drawImage(layer, 0, 0, W, H);

    // After the drop the letters stay on as faint grey shapes behind the headline.
    if (backdrop > 0) {
      ctx.globalAlpha = 0.11 * backdrop;
      for (const l of s.letters) {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.r);
        ctx.drawImage(tint(l.img, '#ffffff', l.w, l.h), -l.w / 2, -l.h / 2, l.w, l.h);
        ctx.restore();
      }
    }

    // Film grain.
    const d = noiseData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = Math.random() < 0.5 ? 0 : 26;
    }
    nctx.putImageData(noiseData, 0, 0);
    ctx.globalAlpha = 0.16 + 0.24 * backdrop;
    ctx.fillStyle = ctx.createPattern(noise, 'repeat');
    ctx.save();
    ctx.translate(-Math.random() * 160, -Math.random() * 160);
    ctx.fillRect(0, 0, W + 160, H + 160);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const frame = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };

  resize();
  start(prefersReducedMotion());
  addEventListener('resize', () => {
    resize();
    if (state.dropped) {
      // Keep the resting letters in proportion to the new viewport.
      const [tw, th] = letterSize(images.t, tScale());
      const [cw, ch] = letterSize(images.c, cScale());
      const sx = W / (state.width || W);
      Object.assign(state.letters[0], { w: tw, h: th, x: state.letters[0].x * sx });
      Object.assign(state.letters[1], { w: cw, h: ch, x: state.letters[1].x * sx });
      state.width = W;
      state.letters.forEach(settle);
    }
  });
  raf = requestAnimationFrame(frame);
  if (state.completed) { onDrop(); onComplete(); }

  return {
    replay() {
      if (!state.completed) return false;
      start();
      return true;
    },
  };
}

export async function initHome() {
  const page = $('.page--home');
  const hero = $('.hero-intro', page ?? document);
  if (!page || !hero) return;
  const copy = $('.homepage-intro-copy', hero);
  const canvas = $('.hero__artwork canvas', hero);

  const showCopy = (on) => {
    document.body.classList.toggle('hero--post-impact', on);
    if (!on) document.body.classList.remove('hero--intro-complete');
    copy?.classList.toggle('homepage-intro-copy--visible', on);
    if (on) copy?.removeAttribute('style');
  };

  setupLinks(hero);
  setupFooterVeil(hero);
  if (!canvas) { showCopy(true); return; }

  let intro;
  try {
    const [t, c, ...animals] = await Promise.all([
      loadImage(`${ASSETS}t.png`), loadImage(`${ASSETS}c.png`), ...ANIMALS.map((a) => loadImage(ASSETS + a.src)),
    ]);
    intro = createIntro(canvas, { t, c, animals }, {
      onDrop: () => showCopy(true),
      onComplete: () => document.body.classList.add('hero--intro-complete'),
    });
  } catch {
    showCopy(true);
    return;
  }

  // Clicking empty space in the hero after the intro replays it.
  hero.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return;
    if (intro.replay()) showCopy(false);
  });
}

// Hovering a link swaps the headline for that section's statement and shows its photo.
function setupLinks(hero) {
  const states = $$('.homepage-intro-copy__desktop-state', hero);
  const images = $$('.homepage-intro-copy__hover-image', hero);
  const overlay = $('.homepage-intro-copy__image-stage-overlay', hero);
  const links = $$('.homepage-intro-copy__desktop-links .homepage-intro-link', hero);
  gsap.set(images, { autoAlpha: 0 });
  for (const el of $$('.homepage-intro-link', hero)) el.style.opacity = '';
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
}

// On desktop the footer sits behind the hero and is uncovered as the page scrolls.
function setupFooterVeil(hero) {
  const veil = $('.homepage-footer-reveal-overlay', hero);
  const onScroll = () => {
    const range = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const progress = Math.min(1, Math.max(0, scrollY / range));
    veil?.style.setProperty('--footer-reveal-overlay-opacity', String(progress * 0.5));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
