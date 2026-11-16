// Per-block behaviours. Each init looks for its own markup and does nothing when it is absent.
import EmblaCarousel from 'embla-carousel';
import { $, $$, gsap, ScrollTrigger, withMotion, refreshOnResize, setPanel, isPanelOpen, scrollToY, prefersReducedMotion } from './core.js';

// ---- media reveal (clip-path wipe as media scrolls into view) -------------------
export function initMediaReveal() {
  for (const el of $$('[data-reveal^="clip"]')) {
    const from = el.dataset.reveal === 'clip-up' ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)';
    const duration = Number(el.dataset.revealDuration) || (el.closest('[data-block="FeaturedWork"]') ? 0.9 : 0.6);
    const parallax = Number(el.dataset.revealParallax) || 0;
    withMotion(() => {
      let played = false;
      let armed = false;
      const play = () => {
        if (!armed || played || document.visibilityState === 'hidden') return;
        played = true;
        gsap.fromTo(el, { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0%)', duration, ease: 'power3.inOut', overwrite: 'auto' });
      };
      gsap.set(el, { clipPath: from });
      const stopRefresh = parallax ? refreshOnResize(el) : null;
      if (parallax) gsap.fromTo(el, { y: 0 }, { y: parallax, ease: 'none', scrollTrigger: { trigger: el, start: 'top 26%', end: 'bottom top', scrub: true } });
      const rect = el.getBoundingClientRect();
      armed = rect.bottom <= 0 || rect.top <= 0.85 * innerHeight;
      document.addEventListener('visibilitychange', play);
      if (armed) play();
      else ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => { armed = true; play(); } });
      return () => { document.removeEventListener('visibilitychange', play); stopRefresh?.(); };
    });
  }
}

// ---- about: introduction ----------------------------------------------------------
export function initAboutIntroduction() {
  for (const block of $$('[data-block="AboutIntroductionBlock"]')) {
    const heading = $('[data-about-introduction-heading]', block);
    const media = $('[data-about-introduction-media]', block);
    const text = $('[data-about-introduction-text]', block);
    if (!heading || !media || !text) continue;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const original = heading.textContent ?? '';
      const chars = [];
      const frag = document.createDocumentFragment();
      for (const part of original.split(/(\s+)/)) {
        if (/^\s+$/.test(part)) { frag.append(document.createTextNode(part)); continue; }
        const word = document.createElement('span');
        word.className = 'inline-block whitespace-nowrap';
        for (const ch of Array.from(part)) {
          const span = document.createElement('span');
          span.className = 'inline-block';
          span.textContent = ch;
          word.append(span);
          chars.push(span);
        }
        frag.append(word);
      }
      heading.replaceChildren(frag);
      const total = Math.max(1.2, 0.035 * chars.length + 0.4);
      const mediaAt = Math.max(0, total - 0.75);
      const textAt = Math.max(0, total - 0.55);
      const drop = block.getBoundingClientRect().bottom - heading.getBoundingClientRect().bottom;
      const tl = gsap.timeline({ scrollTrigger: { trigger: block, start: 'top 80%', once: true } });
      gsap.set(chars, { visibility: 'hidden' });
      tl.fromTo(heading, { y: drop }, { y: 0, duration: total, ease: 'power3.out' }, 0);
      chars.forEach((c, i) => tl.set(c, { visibility: 'visible' }, 0.035 * i));
      tl.fromTo(media, { y: 36 }, { y: 0, duration: total - mediaAt, ease: 'power3.out' }, mediaAt);
      tl.fromTo(text, { opacity: 0, y: 32 }, { opacity: 1, y: 0, duration: total - textAt, ease: 'power3.out' }, textAt);
    });
    mm.add('(max-width: 1023px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo($$('[data-about-introduction-reveal]', block), { y: 24 },
        { y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: block, start: 'top 80%', once: true } });
    });
  }
}

// ---- about: "our team" heading + photo marquee -------------------------------------
export function initOurTeam() {
  const heading = $('[data-our-team-heading]');
  const marquee = $('[data-our-team-marquee]');
  if (marquee && marquee.children.length) {
    // Duplicate the strip until it covers two viewport widths, then loop it at 40px/s.
    const track = document.createElement('div');
    track.className = 'our-team-marquee__track';
    const group = document.createElement('div');
    group.className = 'our-team-marquee__group';
    group.append(...marquee.children);
    track.append(group);
    marquee.append(track);
    const fill = () => {
      const width = group.getBoundingClientRect().width;
      if (!width) return;
      const copies = Math.max(2, Math.ceil((innerWidth * 2) / width) + 1);
      while (track.children.length < copies) { const clone = group.cloneNode(true); clone.setAttribute('aria-hidden', 'true'); track.append(clone); }
      track.style.setProperty('--marquee-duration', `${width / 40}s`);
    };
    fill();
    $$('img', group).forEach((img) => img.complete || img.addEventListener('load', fill, { once: true }));
    addEventListener('resize', fill);
  }
  const text = $('[data-our-team-text]');
  const section = heading?.closest('section');
  if (!heading || !text || !marquee || !section) return;
  withMotion(() => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top 40%', once: true } });
    tl.fromTo(heading, { x: '45vw', y: '30vw' }, { x: '-100px', y: 0, duration: 1, ease: 'power3.inOut' })
      .fromTo(text, { y: '30vw' }, { y: 0, duration: 1, ease: 'power3.inOut' }, '<')
      .fromTo(marquee, { y: '30vw' }, { y: 0, duration: 1, ease: 'power3.inOut' }, '<');
    return () => tl.kill();
  }, '(min-width: 80rem)');
}

// ---- featured work: parallax title + media switcher --------------------------------
export function initFeaturedWork() {
  for (const block of $$('[data-block="FeaturedWork"]')) {
    const title = $(':scope > span.type-heading-l', block);
    if (title) withMotion(() => {
      gsap.fromTo(title, { y: 18 }, { y: 280, ease: 'none', scrollTrigger: { trigger: block, start: 'top 52%', end: 'bottom top', scrub: true } });
    });

    const thumbs = $$('.featured-work__media > button', block);
    const stage = $('.aspect-square.overflow-hidden.relative.w-full', block);
    const slides = stage ? [...stage.children] : [];
    if (thumbs.length < 2 || slides.length !== thumbs.length) continue;
    let active = 0;
    let timer;
    const show = (index) => {
      active = index;
      slides.forEach((slide, i) => {
        const on = i === index;
        slide.classList.toggle('opacity-100', on);
        slide.classList.toggle('opacity-0', !on);
        slide.classList.toggle('pointer-events-none', !on);
        slide.setAttribute('aria-hidden', String(!on));
        slide.inert = !on;
      });
      thumbs.forEach((thumb, i) => {
        thumb.classList.toggle('opacity-20', i !== index);
        thumb.setAttribute('aria-pressed', String(i === index));
      });
      clearInterval(timer);
      timer = setInterval(() => show((active + 1) % slides.length), 5000);
    };
    thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => show(i)));
    show(0);
  }
}

// ---- next up ------------------------------------------------------------------------
export function initNextUp() {
  for (const block of $$('[data-block="NextUp"]')) {
    const link = $('[data-nextup-link]', block);
    if (link) withMotion(() => {
      gsap.fromTo(link, { yPercent: 100 }, { yPercent: 0, duration: 0.6, ease: 'power3.inOut', scrollTrigger: { trigger: block, start: 'bottom bottom', once: true } });
    });
  }
}

// ---- approach: process diagram -----------------------------------------------------
export function initProcess() {
  for (const block of $$('[data-block="ProcessBlock"]')) {
    const scope = block.parentElement;
    withMotion(() => {
      const backgrounds = $$('[data-process-background]', scope);
      const steps = $$('[data-process-step]', scope);
      const connectors = $$('[data-process-connector]', scope);
      const lines = $$('[data-process-connector-line]', scope);
      const outcome = $('[data-process-outcome]', scope);
      const label = $('[data-process-outcome-label]', scope);
      const outcomeLine = $('[data-process-outcome-line]', scope);
      if (!steps.length || !lines.length || !outcome || !label || !outcomeLine) return;
      gsap.set(backgrounds, { autoAlpha: 0, yPercent: 175 });
      gsap.set(steps, { autoAlpha: 0 });
      gsap.set(connectors, { autoAlpha: 0 });
      gsap.set(lines, { clipPath: 'inset(0 50% 0 50%)' });
      gsap.set(outcomeLine, { autoAlpha: 0, scaleX: 0, transformOrigin: 'center' });
      gsap.set(label, { autoAlpha: 0, y: 16 });
      let tl;
      const io = new IntersectionObserver(([entry]) => {
        if (!entry || entry.intersectionRatio < 0.65) return;
        io.disconnect();
        tl = gsap.timeline()
          .to(backgrounds, { autoAlpha: 1, yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.2 })
          .to(steps, { autoAlpha: 1, duration: 0.55, stagger: 0.2 }, '<')
          .to(connectors, { autoAlpha: 1, duration: 0.75, ease: 'power2.out', stagger: 0.1 }, '-=0.36')
          .to(lines, { clipPath: 'inset(0 0% 0 0%)', duration: 0.75, ease: 'power2.out', stagger: 0.1 }, '<')
          .to(outcomeLine, { autoAlpha: 1, scaleX: 1, duration: 0.9, ease: 'power2.out' }, '<')
          .to(label, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out' }, '-=0.45');
      }, { threshold: 0.65 });
      io.observe(block);
      return () => { io.disconnect(); tl?.kill(); };
    }, '(min-width: 768px)');
  }
}

// ---- approach: service descriptions (reveal + one-open-at-a-time accordion) --------
export function initServiceDescriptions() {
  for (const block of $$('[data-block="ServiceDescriptionBlock"]')) {
    const buttons = $$('button[aria-controls]', block);
    buttons.forEach((button) => button.addEventListener('click', () => {
      const open = !isPanelOpen(button);
      buttons.forEach((other) => setPanel(other, other === button && open));
    }));

    withMotion(() => {
      const divider = $('[data-service-description-divider]', block);
      const title = $('[data-service-description-title]', block);
      const content = $('[data-service-description-content]', block);
      if (!divider || !title || !content) return;
      gsap.set(divider, { scaleX: 0, transformOrigin: 'left' });
      gsap.set(title, { autoAlpha: 0, y: 48 });
      gsap.set(content, { autoAlpha: 0, y: 24 });
      let tl;
      const io = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        tl = gsap.timeline()
          .to(divider, { scaleX: 1, duration: 0.7, ease: 'power2.out' })
          .to(title, { autoAlpha: 1, y: 0, duration: 0.65, ease: 'power3.out' }, '-=0.3')
          .to(content, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out' }, '-=0.35');
      }, { threshold: 0.35 });
      io.observe(block);
      return () => { io.disconnect(); tl?.kill(); };
    });
  }
}

// ---- stats: count up ----------------------------------------------------------------
export function initStats() {
  for (const block of $$('[data-block="StatsBlock"]')) {
    const values = $$('[data-stat-value]', block);
    if (!values.length) continue;
    withMotion(() => {
      const counters = values.flatMap((el) => {
        const target = Number(el.dataset.statTarget);
        if (!Number.isFinite(target)) return [];
        const precision = (el.dataset.statTarget?.split('.')[1] ?? '').length;
        const counter = { value: 0 };
        el.textContent = counter.value.toFixed(precision);
        return [{ counter, el, precision, target }];
      });
      if (!counters.length) return;
      const tl = gsap.timeline({ scrollTrigger: { trigger: block, start: 'top 70%', once: true } });
      counters.forEach(({ counter, el, precision, target }, i) => {
        tl.to(counter, { value: target, duration: 1.5, ease: 'power2.out', onUpdate: () => { el.textContent = counter.value.toFixed(precision); } }, 0.12 * i);
      });
    });
  }
}

// ---- team list: name and role part to make room for the portrait -------------------
export function initTeamList() {
  const untransformed = (el) => {
    const x = Number(gsap.getProperty(el, 'x')) || 0;
    const r = el.getBoundingClientRect();
    return { left: r.left - x, right: r.right - x };
  };
  const offsets = (item, name, role) => {
    const box = item.getBoundingClientRect();
    const n = untransformed(name);
    const r = untransformed(role);
    const roleOnLeft = r.left + (r.right - r.left) / 2 <= n.left + (n.right - n.left) / 2;
    const shift = (rect, toLeft) => {
      const room = Math.min(120, Math.max(0, toLeft ? rect.left - box.left - 8 : box.right - 8 - rect.right));
      return toLeft ? -room : room;
    };
    return { name: shift(n, !roleOnLeft), role: shift(r, roleOnLeft), roleOnLeft };
  };
  for (const link of $$('[data-team-list-link]')) {
    const item = link.parentElement;
    const image = $('[data-team-list-image]', item);
    const name = $('[data-team-list-name]', item);
    const role = $('[data-team-list-role]', item);
    if (!image || !name || !role) continue;
    gsap.set(image, { autoAlpha: 0, scale: 0.8, x: 0 });
    const place = () => {
      if (innerWidth < 768) return;
      const o = offsets(item, name, role);
      const n = untransformed(name);
      const r = untransformed(role);
      const centre = o.roleOnLeft ? (r.right + o.role + n.left + o.name) / 2 : (n.right + o.name + r.left + o.role) / 2;
      const l = link.getBoundingClientRect();
      gsap.set(image, { x: centre - (l.left + l.right) / 2 });
    };
    const ro = new ResizeObserver(place);
    [link, name, role].forEach((el) => ro.observe(el));
    place();
    document.fonts.ready.then(place);
    const enter = () => {
      if (innerWidth < 768) return;
      const o = offsets(item, name, role);
      const d = prefersReducedMotion() ? 0 : 0.55;
      gsap.to(role, { x: o.role, duration: d, ease: 'power3.out', overwrite: true });
      gsap.to(name, { x: o.name, duration: d, ease: 'power3.out', overwrite: true });
      gsap.to(image, { autoAlpha: 1, scale: 1, duration: 0.8 * d, ease: 'power2.out', overwrite: true });
    };
    const leave = () => {
      if (innerWidth < 768) return;
      const d = prefersReducedMotion() ? 0 : 0.4;
      gsap.to([name, role], { x: 0, duration: d, ease: 'power2.out', overwrite: true });
      gsap.to(image, { autoAlpha: 0, scale: 0.8, duration: d, ease: 'power2.out', overwrite: true });
    };
    item.addEventListener('mouseenter', enter);
    item.addEventListener('mouseleave', leave);
    item.addEventListener('focusin', enter);
    item.addEventListener('focusout', (e) => { if (!item.contains(e.relatedTarget)) leave(); });
  }
}

// ---- team member header: adjective tags ---------------------------------------------
export function initTeamHeader() {
  const tags = $$('[data-team-header-adjective]');
  const labels = $$('[data-team-header-adjective-label]');
  if (!tags.length) return;
  gsap.set(tags, { scaleX: 0, transformOrigin: 'left' });
  gsap.set(labels, { opacity: 0 });
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const tl = gsap.timeline()
      .to(tags, { scaleX: 1, duration: 0.3, ease: 'power2.out', stagger: 0.1 })
      .to(labels, { opacity: 1, duration: 0.2, stagger: 0.025 });
    return () => tl.kill();
  });
  mm.add('(prefers-reduced-motion: reduce)', () => { gsap.set(tags, { scaleX: 1 }); gsap.set(labels, { opacity: 1 }); });
}

// ---- testimonial: media travels the height of the block while scrolling ------------
export function initTestimonials() {
  for (const block of $$('[data-block="TestimonialBlock"]')) {
    const media = $('[data-testimonial-media]', block.parentElement);
    if (!media) continue;
    withMotion(() => {
      const range = () => {
        const b = block.getBoundingClientRect();
        const m = media.getBoundingClientRect();
        const top = m.top - (Number(gsap.getProperty(media, 'y')) || 0);
        return { start: b.top - top, end: b.bottom - top - media.offsetHeight };
      };
      gsap.fromTo(media, { y: () => range().start }, { y: () => range().end, ease: 'none', scrollTrigger: { trigger: block, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
    }, '(min-width: 1280px)');
  }
}

// ---- headings that slide across the viewport while scrolling ------------------------
export function initScrollHeadings() {
  for (const el of $$('[data-block="WorkArchiveList"] > h2')) {
    withMotion(() => {
      const box = () => {
        const r = el.getBoundingClientRect();
        const x = Number(gsap.getProperty(el, 'x'));
        return { left: r.left - x, right: r.right - x };
      };
      gsap.fromTo(el, { x: () => document.documentElement.clientWidth - box().right }, { x: () => -box().left, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
    }, '(min-width: 48rem)');
  }
}

// ---- work archive list: floating media preview on hover -----------------------------
export function initWorkArchivePreview() {
  for (const list of $$('.work-archive-list__items')) {
    const stage = list.parentElement.querySelector(':scope > [aria-hidden="true"]');
    if (!stage) continue;
    let current = null;
    const clear = () => { current = null; stage.replaceChildren(); };
    list.addEventListener('pointerleave', clear);
    list.addEventListener('pointerover', (e) => {
      const item = e.target.closest?.('[data-preview-index]');
      if (!item || !list.contains(item) || item === current) return;
      const src = item.dataset.previewSrc;
      if (!src) { clear(); return; }
      const first = current === null;
      current = item;
      const host = list.parentElement.getBoundingClientRect();
      const row = item.getBoundingClientRect();
      stage.style.top = `${row.top - host.top + row.height / 2}px`;
      const frame = document.createElement('div');
      frame.className = 'absolute inset-0 overflow-hidden';
      const media = /\.(mp4|webm|mov)$/i.test(src) ? Object.assign(document.createElement('video'), { src, autoplay: true, muted: true, loop: true, playsInline: true }) : Object.assign(document.createElement('img'), { src, alt: '' });
      media.className = 'absolute inset-0 h-full w-full object-cover';
      frame.append(media);
      stage.append(frame);
      const done = () => { while (stage.firstChild !== frame && stage.firstChild) stage.firstChild.remove(); };
      if (prefersReducedMotion()) done();
      else gsap.fromTo(frame, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: first ? 0.6 : 0.3, ease: 'power3.inOut', onComplete: done });
    });
  }
}

// ---- case study hero: media dissolves into the details panel ------------------------
export function initWorkHero() {
  for (const root of $$('[data-work-hero-scroll-root]')) {
    const stage = $('.work-header__media-stage', root);
    const media = $('.work-header__media', root);
    const content = $('.work-header__content', root);
    if (!stage || !media || !content) continue;
    withMotion(() => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: stage, start: 'top top', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
      tl.fromTo(media, { autoAlpha: 1, scale: 1, yPercent: 0 }, { autoAlpha: 0, scale: 0.88, yPercent: 22, duration: 0.75, ease: 'power1.out' }, 0);
      tl.fromTo(content, { autoAlpha: 0, y: 120 }, { autoAlpha: 1, y: 0, duration: 0.65, ease: 'power2.out' }, 0.15);
      return refreshOnResize(content);
    });

    const tab = $('[data-work-hero-details-tab]', root);
    if (!tab) continue;
    new IntersectionObserver(([entry]) => {
      const show = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
      tab.classList.toggle('pointer-events-auto', show);
      tab.classList.toggle('opacity-100', show);
      tab.classList.toggle('pointer-events-none', !show);
      tab.classList.toggle('opacity-0', !show);
      tab.setAttribute('aria-hidden', String(!show));
      tab.tabIndex = show ? 0 : -1;
    }).observe(content);
    tab.addEventListener('click', () => scrollToY(root.getBoundingClientRect().top + scrollY + content.offsetTop));
  }
}

// ---- generic accordions (anything not owned by a more specific block) --------------
export function initAccordions() {
  for (const button of $$('button[aria-controls]')) {
    if (button.getAttribute('aria-controls') === 'navigation-menu') continue;
    if (button.closest('[data-block="ServiceDescriptionBlock"], [data-block="ArchiveFilterControls"], .article-chapter-links')) continue;
    button.addEventListener('click', () => setPanel(button, !isPanelOpen(button)));
  }
}

// ---- carousels ------------------------------------------------------------------------
export function initCarousels() {
  for (const prev of $$('button[aria-label^="Previous"]')) {
    const viewport = prev.closest('section, [data-block]')?.querySelector('.overflow-hidden:has(> .flex.touch-pan-y), .overflow-hidden:has(> .flex > article)');
    if (!viewport || viewport.dataset.carousel) continue;
    viewport.dataset.carousel = 'true';
    const slides = [...viewport.firstElementChild.children];
    const embla = EmblaCarousel(viewport, { loop: slides.length > 1 });
    const scope = viewport.closest('section, [data-block]');
    $$('button[aria-label^="Previous"]', scope).forEach((b) => b.addEventListener('click', () => embla.scrollPrev()));
    $$('button[aria-label^="Next"]', scope).forEach((b) => b.addEventListener('click', () => embla.scrollNext()));
    const sync = () => {
      const selected = embla.selectedScrollSnap();
      slides.forEach((slide, i) => { slide.inert = i !== selected; slide.setAttribute('aria-hidden', String(i !== selected)); });
      $$('[aria-live="polite"]', scope).forEach((el) => { if (/^\d+\/\d+$/.test(el.textContent.trim())) el.textContent = `${selected + 1}/${slides.length}`; });
    };
    embla.on('select', sync);
    sync();
  }
}
