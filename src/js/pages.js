// Page-level behaviours: article reading aids and archive filters.
import { $, $$, ScrollTrigger, scrollToY, setPanel, isPanelOpen } from './core.js';

const pad = (n) => String(n).padStart(2, '0');
const desktop = () => matchMedia('(min-width: 1024px)').matches;

// ---- article: sticky chapter navigator ----------------------------------------------
export function initArticleChapters() {
  const nav = $('.article-chapter-links');
  if (!nav) return;
  const toggle = $(':scope > button', nav);
  const label = $('.type-label-s', toggle);
  const list = $('#article-chapter-list', nav);
  const wrapper = list?.parentElement;
  const chapters = $$('[data-chapter-number][id^="chapter-"]');
  const buttons = $$('li > button', list);
  if (!toggle || !list || !chapters.length) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    list.setAttribute('aria-hidden', String(!open));
    for (const c of ['bg-black', 'text-white', 'lg:border-r-black']) toggle.classList.toggle(c, open);
    toggle.classList.toggle('lg:border-black-30', !open);
    for (const c of ['grid-rows-[1fr]', 'lg:grid-cols-[1fr]', 'lg:border', 'lg:border-black-30']) wrapper.classList.toggle(c, open);
    for (const c of ['grid-rows-[0fr]', 'lg:grid-cols-[0fr]']) wrapper.classList.toggle(c, !open);
  };
  const setCurrent = (number) => {
    if (label) label.textContent = `Chapter ${pad(number)}`;
    buttons.forEach((button, i) => {
      const on = Number(chapters[i]?.dataset.chapterNumber) === number;
      button.setAttribute('aria-pressed', String(on));
      button.closest('li').classList.toggle('bg-black-10', on);
    });
  };

  nav.addEventListener('mouseenter', () => desktop() && setOpen(true));
  nav.addEventListener('mouseleave', () => desktop() && setOpen(false));
  nav.addEventListener('focusin', () => desktop() && document.activeElement?.matches(':focus-visible') && setOpen(true));
  nav.addEventListener('focusout', (e) => desktop() && !nav.contains(e.relatedTarget) && setOpen(false));
  toggle.addEventListener('click', () => { if (!desktop()) setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
  buttons.forEach((button, i) => button.addEventListener('click', () => {
    const chapter = chapters[i];
    if (!chapter) return;
    setCurrent(Number(chapter.dataset.chapterNumber));
    history.replaceState(null, '', `#${chapter.id}`);
    scrollToY(chapter);
  }));

  const io = new IntersectionObserver((entries) => {
    const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    const number = Number(top?.target.dataset.chapterNumber);
    if (Number.isFinite(number)) setCurrent(number);
  }, { rootMargin: '-20% 0px -70% 0px' });
  chapters.forEach((chapter) => io.observe(chapter));
}

// ---- article: share + copy link -------------------------------------------------------
export function initArticleShare() {
  const url = location.origin + location.pathname;
  for (const a of $$('a[href*="linkedin.com/sharing/share-offsite"]')) a.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  for (const a of $$('a[href*="facebook.com/sharer"]')) a.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  for (const button of $$('button[aria-label="Copy article link"]')) {
    const status = Object.assign(document.createElement('span'), { className: 'type-label-s pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap transition-opacity duration-300 opacity-0' });
    status.setAttribute('role', 'status');
    button.append(status);
    let timer;
    button.addEventListener('click', async () => {
      let message = 'Copied';
      try { await navigator.clipboard.writeText(url); } catch { message = 'Unable to copy link'; }
      status.textContent = message;
      status.classList.remove('opacity-0');
      clearTimeout(timer);
      timer = setTimeout(() => status.classList.add('opacity-0'), 4000);
    });
  }
}

// ---- archive filters -------------------------------------------------------------------
// The build embeds, per option, the list of item links that option matches.
export function initArchiveFilters() {
  const controls = $('[data-block="ArchiveFilterControls"]');
  const data = window.__ARCHIVE_FILTERS__;
  if (!controls) return;

  const mobileToggle = $('button[aria-controls]', controls);
  mobileToggle?.addEventListener('click', () => {
    const open = !isPanelOpen(mobileToggle);
    setPanel(mobileToggle, open);
    mobileToggle.parentElement.classList.toggle('border-b-(--color-foreground)', open);
    mobileToggle.parentElement.classList.toggle('border-b-transparent', !open);
  });
  if (!data) return;

  const selects = $$('select', controls);
  const hrefOf = (el) => $$('a[href]', el).map((a) => a.getAttribute('href')).find((h) => data.all.includes(h));
  const items = $$('[data-block="FeaturedWork"], .work-archive-list__items > li, .article-card-wrapper').map((el) => ({ el, href: hrefOf(el) })).filter((item) => item.href);
  const params = new URLSearchParams(location.search);
  const state = {};
  for (const select of selects) {
    const value = [...params.entries()].find(([k]) => k.toLowerCase() === select.name.toLowerCase())?.[1] ?? '';
    state[select.name] = [...select.options].some((o) => o.value === value) ? value : '';
  }
  const empty = Object.assign(document.createElement('p'), { className: 'container-full-width type-heading-h5 py-28 text-center', textContent: 'Nothing matches those filters yet.', hidden: true });
  controls.after(empty);

  const apply = (push) => {
    let allowed = null;
    let order = null;
    for (const [name, value] of Object.entries(state)) {
      const match = value && data.options[name]?.[value];
      if (!match) continue;
      if (name === 'sort') order = match;
      else allowed = allowed ? allowed.filter((h) => match.includes(h)) : match;
    }
    let visible = 0;
    for (const { el, href } of items) {
      const show = !allowed || allowed.includes(href);
      el.hidden = !show;
      if (show) visible++;
    }
    if (order) {
      for (const parent of new Set(items.map((i) => i.el.parentElement))) {
        items.filter((i) => i.el.parentElement === parent).sort((a, b) => order.indexOf(a.href) - order.indexOf(b.href)).forEach((i) => parent.append(i.el));
      }
    }
    for (const section of $$('[data-block="WorkArchiveList"]')) section.hidden = !$$('.work-archive-list__items > li', section).some((li) => !li.hidden);
    empty.hidden = visible > 0;

    for (const select of selects) {
      select.value = state[select.name];
      const label = select.parentElement.querySelector('.type-link');
      if (label) {
        label.dataset.default ??= label.textContent;
        label.textContent = select.value ? select.selectedOptions[0].textContent : label.dataset.default;
      }
    }
    if (push) {
      const next = new URLSearchParams();
      for (const [name, value] of Object.entries(state)) if (value) next.set(name, value);
      history.replaceState(null, '', next.size ? `${location.pathname}?${next}` : location.pathname);
    }
    requestAnimationFrame(() => ScrollTrigger.refresh(true));
  };

  selects.forEach((select) => select.addEventListener('change', () => { state[select.name] = select.value; apply(true); }));
  if (Object.values(state).some(Boolean)) apply(false);
}
