// Nav scroll shadow
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 8);
}, { passive: true });

// Scroll progress bar
const progressBar = document.getElementById('progress');
function updateProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
  progressBar.style.width = `${pct}%`;
}
window.addEventListener('scroll', updateProgress, { passive: true });
updateProgress();

// Scrollspy — highlight the nav link for the section currently in view
const navLinks = document.querySelectorAll('[data-nav]');
const spySections = [...navLinks].map(link => document.getElementById(link.dataset.nav)).filter(Boolean);

const spyObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const link = document.querySelector(`[data-nav="${entry.target.id}"]`);
    if (!link) return;
    if (entry.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('is-active'));
      link.classList.add('is-active');
    }
  });
}, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

spySections.forEach(section => spyObserver.observe(section));

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Hero photo: subtle parallax while scrolling past the hero
// (moves the whole photo+caption block together — moving just the frame
// caused it to slide over its own caption text, which was a real bug)
const heroPhotoBlock = document.querySelector('.hero__photo');
const heroSection = document.querySelector('.hero');
if (heroPhotoBlock && heroSection && !prefersReducedMotion) {
  let ticking = false;
  function updateHeroParallax() {
    const rect = heroSection.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      heroPhotoBlock.style.transform = `translateY(${Math.max(rect.top, -400) * -0.08}px)`;
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateHeroParallax);
      ticking = true;
    }
  }, { passive: true });
}

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const mobileMenu = document.getElementById('mobileMenu');

navToggle.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('is-open');
  navToggle.classList.toggle('is-active', isOpen);
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('is-open');
    navToggle.classList.remove('is-active');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Scroll reveal
const revealTargets = document.querySelectorAll(
  '.section__head, .about__text, .about__proof, .exp-card, .case, .skills__group, .contact__line, .contact__links'
);
revealTargets.forEach(el => el.classList.add('reveal'));

// Stagger case rows slightly for a more premium feel
document.querySelectorAll('.case').forEach((el, i) => {
  el.style.transitionDelay = `${i * 90}ms`;
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

revealTargets.forEach(el => revealObserver.observe(el));

// Project category filter
const filterButtons = document.querySelectorAll('.case-filter__btn');
const caseArticles = document.querySelectorAll('.case[data-category]');

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');

    const filter = btn.dataset.filter;
    caseArticles.forEach(article => {
      const match = filter === 'all' || article.dataset.category === filter;
      article.classList.toggle('is-filtered-out', !match);
    });
  });
});

// Count-up animation for stat numbers
function animateCount(el) {
  const target = parseFloat(el.dataset.countTo);
  const suffix = el.dataset.suffix || '';
  const duration = 1100;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(eased * target);
    el.textContent = `${value}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const countTargets = document.querySelectorAll('[data-count-to]');
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCount(entry.target);
      countObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.4 });

countTargets.forEach(el => countObserver.observe(el));


// ================= PREMIUM INTERACTIONS =================
// Hero headline reveal is now pure CSS (masked line-reveal on static markup) —
// no JS text-splitting needed. Simpler, more robust, less "trying too hard."

// (Cursor-spotlight glow, 3D tilt, and magnetic buttons intentionally removed —
//  those effects are now a recognizable "AI-generated portfolio" tell. Restraint
//  reads as more considered than motion for its own sake.)


// ================= CONTACT FORM SUBMISSION =================
// Uses Formspree (free, no backend needed) — replace the form's `action`
// URL in index.html with your own endpoint from formspree.io
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  const statusEl = document.getElementById('formStatus');
  const submitBtn = contactForm.querySelector('.form__submit');
  const submitText = contactForm.querySelector('.form__submit-text');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitText.textContent = 'Sending…';
    statusEl.textContent = '';
    statusEl.className = 'form__status';

    try {
      const res = await fetch(contactForm.action, {
        method: 'POST',
        body: new FormData(contactForm),
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        statusEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg><span>Got it — I read every message myself. I\'ll be in touch soon.</span>';
        statusEl.classList.add('is-success');
        contactForm.reset();
      } else {
        throw new Error('Submission failed');
      }
    } catch (err) {
      statusEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Something went wrong on my end — please email me directly instead.</span>';
      statusEl.classList.add('is-error');
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = 'Send message';
    }
  });
}