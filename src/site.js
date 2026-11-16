// Site interactions. Each feature is self-contained and bails out if its markup is absent.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nav = $('nav[aria-label="Main navigation"]');

  // ---- full-screen menu -------------------------------------------------------
  const menu = $('#navigation-menu');
  const toggle = $('[aria-controls="navigation-menu"]');
  if (menu && toggle) {
    const icon = $('.material-symbols-outlined', toggle);
    const label = $('.type-link', toggle);
    icon?.classList.add('menu-toggle-icon');
    const setOpen = (open) => {
      menu.classList.toggle('is-open', open);
      menu.inert = !open;
      menu.setAttribute('aria-hidden', String(!open));
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (label) label.textContent = open ? 'CLOSE' : 'MENU';
      icon?.classList.toggle('is-open', open);
      document.documentElement.style.overflow = open ? 'hidden' : '';
      if (nav) nav.dataset.menuOpen = String(open);
    };
    toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
  }

  // ---- scroll reveals ---------------------------------------------------------
  const reveals = $$('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-revealed'));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-revealed'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((el) => io.observe(el.dataset.reveal === 'rise' ? el : el));
    // Elements clipped by their own reveal state never intersect; observe the parent instead.
    $$('[data-reveal="rise"], [data-reveal="clip"]').forEach((el) => {
      io.unobserve(el);
      const host = el.parentElement;
      const io2 = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { el.classList.add('is-revealed'); io2.disconnect(); }
      }, { rootMargin: '0px 0px -8% 0px' });
      io2.observe(host);
    });
  }
})();
