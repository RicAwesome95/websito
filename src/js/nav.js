import { $ } from './core.js';

// Full-screen menu. While it is open the navbar adopts the menu's light theme.
export function initMenu() {
  const nav = $('nav[aria-label="Main navigation"]');
  const menu = $('#navigation-menu');
  const toggle = $('[aria-controls="navigation-menu"]');
  if (!menu || !toggle) return;
  const icon = $('.material-symbols-outlined', toggle);
  const label = $('.type-link', toggle);
  const pageTheme = nav?.dataset.theme;
  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    menu.inert = !open;
    menu.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (label) label.textContent = open ? 'CLOSE' : 'MENU';
    icon?.classList.toggle('rotate-45', open);
    document.documentElement.classList.toggle('menu-open', open);
    if (nav) {
      nav.dataset.menuOpen = String(open);
      nav.dataset.theme = open ? 'white' : pageTheme;
    }
  };
  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
  });
}
