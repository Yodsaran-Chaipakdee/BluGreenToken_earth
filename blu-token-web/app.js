const header = document.querySelector('[data-header]');
const nav = document.querySelector('[data-nav]');
const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = [...document.querySelectorAll('.site-nav a')];
const sections = navLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);

function setHeaderState() {
  header?.classList.toggle('is-scrolled', window.scrollY > 36);
}
setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive: true });

navToggle?.addEventListener('click', () => {
  nav?.classList.toggle('is-open');
});
navLinks.forEach(link => link.addEventListener('click', () => nav?.classList.remove('is-open')));

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

const navObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navLinks.forEach(link => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
    });
  });
}, { rootMargin: '-44% 0px -50% 0px', threshold: 0 });
sections.forEach(section => navObserver.observe(section));

document.querySelectorAll('[data-count]').forEach(el => {
  const finalValue = Number(el.dataset.count);
  if (!Number.isFinite(finalValue)) return;
  const format = value => value.toLocaleString('en-US', {
    minimumFractionDigits: finalValue % 1 ? 2 : 0,
    maximumFractionDigits: finalValue % 1 ? 2 : 0,
  });
  let started = false;
  const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || started) return;
      started = true;
      const duration = 900;
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = format(finalValue * eased);
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = format(finalValue);
      }
      requestAnimationFrame(tick);
      counterObserver.disconnect();
    });
  }, { threshold: 0.7 });
  counterObserver.observe(el);
});

const tabs = [...document.querySelectorAll('[data-tab]')];
const panels = [...document.querySelectorAll('[data-panel]')];
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const key = tab.dataset.tab;
    tabs.forEach(item => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.panel === key));
  });
});

const lightbox = document.querySelector('[data-lightbox-dialog]');
const lightboxImg = document.querySelector('[data-lightbox-img]');
const closeLightbox = document.querySelector('[data-lightbox-close]');
function openLightbox(src) {
  if (!lightbox || !lightboxImg) return;
  lightboxImg.src = src;
  lightbox.classList.add('is-open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');
}
function hideLightbox() {
  if (!lightbox || !lightboxImg) return;
  lightbox.classList.remove('is-open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-locked');
  setTimeout(() => { lightboxImg.src = ''; }, 160);
}
document.querySelectorAll('[data-lightbox]').forEach(card => {
  card.addEventListener('click', () => openLightbox(card.dataset.lightbox));
});
closeLightbox?.addEventListener('click', hideLightbox);
lightbox?.addEventListener('click', event => {
  if (event.target === lightbox) hideLightbox();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideLightbox();
});
