// Newsletter sign-up and the contact note form. Both are progressive: the trigger button is
// replaced by a small form. Submissions go to the endpoint configured at build time
// (FORM_ENDPOINT); without one they fall back to opening the visitor's mail client.
import { $, $$, gsap, prefersReducedMotion } from './core.js';

const CONTACT_EMAIL = 'worktogether@thecontenders.co';
const endpoint = () => document.documentElement.dataset.formEndpoint || '';
const icon = (name, size) => `<span aria-hidden="true" class="material-symbols-outlined" style="font-size:${size}px">${name}</span>`;
const validEmail = (value) => /^\S+@\S+\.\S+$/.test(value);

async function send(kind, fields) {
  if (endpoint()) {
    const res = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: kind, ...fields }) });
    if (!res.ok) throw new Error('Request failed');
    return 'sent';
  }
  const subject = kind === 'newsletter' ? 'Newsletter sign up' : `Website note from ${fields.name}`;
  const body = kind === 'newsletter' ? `Please add ${fields.email} to the newsletter.` : `${fields.message}\n\n${fields.name}\n${fields.email}`;
  location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return 'mail';
}

function swap(from, to) {
  from.hidden = true;
  to.hidden = false;
  if (!prefersReducedMotion()) gsap.fromTo(to, { opacity: 0, clipPath: 'inset(0% 100% 0% 0%)' }, { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'power3.out' });
}

// ---- newsletter (footer and menu) -----------------------------------------------------
export function initNewsletter() {
  $$('.form-wrapper').forEach((wrapper, index) => {
    const trigger = $('.reveal-form-button', wrapper);
    if (!trigger) return;
    const id = `newsletter-email-${index}`;
    const panel = document.createElement('div');
    panel.className = 'max-w-77 origin-left lg:max-w-none';
    panel.hidden = true;
    panel.innerHTML = `
      <form class="flex flex-col gap-4 pt-4 lg:flex-row lg:items-center lg:gap-10 lg:pt-0" novalidate>
        <div class="flex items-center gap-4 border-b border-(--color-foreground)">
          <label class="sr-only" for="${id}">Email address</label>
          <input class="type-heading-h5 lg:type-heading-h4 w-full bg-transparent uppercase outline-none placeholder:opacity-60 lg:w-96" id="${id}" name="email" type="email" autocomplete="email" placeholder="Enter your email" aria-required="true" aria-invalid="false">
          <button class="cursor-pointer" type="submit"><span class="sr-only">Sign up</span>${icon('subdirectory_arrow_left', 40)}</button>
        </div>
        <div class="flex items-center gap-4">
          <button class="cursor-pointer" type="button" data-close><span class="sr-only">Close newsletter signup</span>${icon('close', 18)}</button>
          <p class="type-label-s font-light leading-tight tracking-tighter uppercase lg:max-w-77">By signing up, you're confirming that you agree with our <a class="underline underline-offset-2" href="/terms" target="_blank" rel="noopener noreferrer">terms and conditions</a>.</p>
        </div>
        <p class="type-label-s uppercase" role="status" aria-live="polite" data-status></p>
      </form>`;
    trigger.after(panel);
    const form = $('form', panel);
    const input = $('input', form);
    const status = $('[data-status]', form);

    trigger.addEventListener('click', () => { swap(trigger, panel); input.focus(); });
    $('[data-close]', form).addEventListener('click', () => { swap(panel, trigger); trigger.focus(); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = input.value.trim();
      const ok = validEmail(email);
      input.setAttribute('aria-invalid', String(!ok));
      if (!ok) { status.textContent = 'Please enter a valid email address.'; input.focus(); return; }
      status.textContent = 'Sending…';
      try { status.textContent = (await send('newsletter', { email })) === 'sent' ? 'Thanks — you are on the list.' : 'Opening your email app…'; form.reset(); }
      catch { status.textContent = 'Something went wrong. Please try again.'; }
    });
  });
}

// ---- contact: "leave us a quick note" ---------------------------------------------------
export function initContactNote() {
  const trigger = $$('main button').find((b) => /quick note/i.test(b.textContent));
  if (!trigger) return;
  const field = 'type-heading-h6 w-full border-b border-(--color-foreground) bg-transparent py-3 outline-none placeholder:opacity-60';
  const panel = document.createElement('form');
  panel.className = 'mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 text-left md:px-5';
  panel.noValidate = true;
  panel.hidden = true;
  panel.innerHTML = `
    <div class="flex flex-col gap-2"><label class="type-label-s uppercase" for="note-name">Your name</label><input class="${field}" id="note-name" name="name" autocomplete="name" placeholder="Name" aria-required="true"></div>
    <div class="flex flex-col gap-2"><label class="type-label-s uppercase" for="note-email">Email address</label><input class="${field}" id="note-email" name="email" type="email" autocomplete="email" placeholder="Email" aria-required="true"></div>
    <div class="flex flex-col gap-2"><label class="type-label-s uppercase" for="note-message">Your note</label><textarea class="${field}" id="note-message" name="message" rows="4" placeholder="How can we help?" aria-required="true"></textarea></div>
    <div class="flex items-center justify-between gap-6">
      <button class="type-link inline-flex cursor-pointer items-center gap-2 border-b border-(--color-foreground)" type="submit">${icon('arrow_forward', 24)}Send note</button>
      <button class="type-link cursor-pointer opacity-60" type="button" data-close>Cancel</button>
    </div>
    <p class="type-label-s uppercase" role="status" aria-live="polite" data-status></p>`;
  trigger.after(panel);
  const status = $('[data-status]', panel);

  trigger.type = 'button';
  trigger.addEventListener('click', () => { swap(trigger, panel); $('input', panel).focus(); });
  $('[data-close]', panel).addEventListener('click', () => { swap(panel, trigger); trigger.focus(); });
  panel.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(panel));
    const problems = [];
    if (!data.name.trim()) problems.push(['name', 'Please enter your name.']);
    if (!validEmail(data.email.trim())) problems.push(['email', 'Please enter a valid email address.']);
    if (!data.message.trim()) problems.push(['message', 'Please write a short note.']);
    for (const el of panel.elements) if (el.name) el.setAttribute('aria-invalid', String(problems.some(([name]) => name === el.name)));
    if (problems.length) { status.textContent = problems[0][1]; panel.elements[problems[0][0]].focus(); return; }
    status.textContent = 'Sending…';
    try { status.textContent = (await send('contact', data)) === 'sent' ? 'Thanks — we will be in touch.' : 'Opening your email app…'; }
    catch { status.textContent = 'Something went wrong. Please try again.'; }
  });
}
