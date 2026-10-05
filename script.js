(() => {
'use strict';

const html = document.documentElement;
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer  = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ================= SMOOTH SCROLL (Lenis) ================= */
// Inertial wheel scrolling; touch stays native. Driven from the single rAF loop below.
let lenis = null;
if (!reduceMotion && window.Lenis) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, touchMultiplier: 1.3 });
  lenis.stop(); // released when the preloader finishes
}

/* ================= TEXT HELPERS ================= */

// Wrap every word in a masked span so it can slide up. Keeps inline children (em, span) intact.
function splitWords(el) {
  let idx = 0;
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  const walk = (node) => {
    [...node.childNodes].forEach((ch) => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        ch.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
          const i = document.createElement('span'); i.className = 'w__i'; i.textContent = part;
          i.style.setProperty('--wi', idx++);
          w.appendChild(i); frag.appendChild(w);
        });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    });
  };
  walk(el);
}

const SCRAMBLE_CHARS = '01<>/_-+*#=%';
function scramble(el, final, duration = 900) {
  const start = performance.now();
  const len = final.length;
  (function step(now) {
    const p = clamp((now - start) / duration, 0, 1);
    const resolved = Math.floor(p * len);
    let out = '';
    for (let i = 0; i < len; i++) {
      const c = final[i];
      out += (i < resolved || c === ' ' || c === '—') ? c : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(step); else el.textContent = final;
  })(start);
}

/* ================= SETUP SPLITS ================= */
const heroHeadline = $('#heroHeadline');
if (heroHeadline) { heroHeadline.style.setProperty('--base', '150ms'); splitWords(heroHeadline); }
$$('.split-words').forEach(splitWords);

const scrambleEls = $$('[data-scramble]');
scrambleEls.forEach((el) => { el.dataset.final = el.textContent; if (!reduceMotion) el.textContent = el.textContent.replace(/[^\s—]/g, '·'); });

/* ================= HERO INTRO ================= */
let heroStarted = false;
function startHero() {
  if (heroStarted) return;
  heroStarted = true;
  $('#hero').classList.add('is-in-hero');
  if (heroHeadline) heroHeadline.classList.add('is-in');
  setTimeout(typeRoles, 1500);
  setTimeout(() => heroHeadline && heroHeadline.classList.add('settled'), 3400);
}

/* ================= PRELOADER ================= */
(function preloader() {
  const loader = $('#loader');
  if (!loader) { startHero(); return; }
  const countEl = $('#loaderCount'), barEl = $('#loaderBar');
  html.classList.add('is-loading');

  let ready = document.readyState === 'complete';
  if (!ready) window.addEventListener('load', () => { ready = true; });
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  let fonts = false; fontsReady.then(() => { fonts = true; });

  const t0 = performance.now();
  const minTime = reduceMotion ? 0 : 1500;
  let p = 0, finished = false;

  (function tick(now) {
    const elapsed = now - t0;
    const canFinish = ready && fonts && elapsed > minTime;
    const target = canFinish ? 100 : Math.min(88, (elapsed / 1600) * 88);
    p += (target - p) * (canFinish ? 0.22 : 0.09);
    if (target === 100 && p > 99.4) p = 100;
    countEl.textContent = Math.round(p);
    barEl.style.transform = `scaleX(${p / 100})`;
    if (p < 100) { requestAnimationFrame(tick); return; }
    if (finished) return;
    finished = true;
    setTimeout(() => {
      loader.classList.add('is-done');
      html.classList.remove('is-loading');
      if (lenis) lenis.start();
      setTimeout(startHero, 550);
      setTimeout(() => loader.classList.add('is-gone'), 1200);
    }, 280);
  })(t0);
})();

/* ================= ORB: live ribbed sphere behind the portrait (WebGL) ================= */
// Analytic sphere shading in a fragment shader: latitude ribs bend the normal, an orange key light,
// a sand rim light and a fresnel edge. The rib axis slowly precesses and leans toward the mouse.
(function orb() {
  const canvas = $('#orb');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: true, alpha: true });
  if (!gl) { canvas.parentElement.classList.add('no-gl'); return; }

  const vs = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const fs = `
    precision highp float;
    uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
    mat3 rx(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
    mat3 rz(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
    void main(){
      vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
      float R = 0.76;
      float r = length(p);
      vec3 accent = vec3(1.0, 0.357, 0.18);
      vec3 sand   = vec3(0.913, 0.847, 0.749);

      // soft halo outside the sphere
      float halo = exp(-max(r - R, 0.0) * 9.0) * 0.22 * smoothstep(R - 0.02, R + 0.02, r) * (1.0 - smoothstep(0.8, 0.98, r));
      if (r > R + 0.004) { gl_FragColor = vec4(accent * halo, halo); return; }

      vec2 q = p / R;
      float z = sqrt(max(0.0, 1.0 - dot(q, q)));
      vec3 n = vec3(q, z);

      float t = uTime;
      mat3 M = rz(-0.42 + 0.12 * sin(t * 0.21) + uMouse.x * 0.25) * rx(0.62 + 0.10 * cos(t * 0.17) - uMouse.y * 0.25);
      vec3 axis = vec3(M[0].y, M[1].y, M[2].y);            // rib axis in view space
      float lat = asin(clamp(dot(n, axis), -1.0, 1.0));
      float K = 42.0;
      float phase = lat * K + t * 0.6;
      vec3 tang = normalize(axis - n * dot(axis, n) + 1e-5);
      vec3 nn = normalize(n + tang * cos(phase) * 0.6);     // each band bulges like a ridge

      vec3 L1 = normalize(vec3(0.55, 0.65, 0.55));          // warm key, top-right
      vec3 L2 = normalize(vec3(-0.85, -0.25, 0.35));        // cool rim, left
      vec3 V  = vec3(0.0, 0.0, 1.0);
      float d1 = max(dot(nn, L1), 0.0);
      float d2 = max(dot(nn, L2), 0.0);
      float spec = pow(max(dot(reflect(-L1, nn), V), 0.0), 36.0);
      float spec2 = pow(max(dot(reflect(-L2, nn), V), 0.0), 24.0);
      float fres = pow(1.0 - z, 2.6);
      float groove = 0.55 + 0.45 * smoothstep(-0.9, 0.4, sin(phase));

      vec3 col = vec3(0.035, 0.034, 0.036);
      col += accent * d1 * 0.62;
      col += sand * d2 * 0.16;
      col += vec3(1.0, 0.82, 0.72) * spec * 0.85;
      col += sand * spec2 * 0.25;
      col += accent * fres * 0.55;
      col *= groove;
      col *= 0.82 + 0.18 * z;                                 // a touch of depth falloff

      float a = smoothstep(R + 0.004, R - 0.004, r);
      gl_FragColor = vec4(col * a + accent * halo * (1.0 - a), max(a, halo));
    }`;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    canvas.parentElement.classList.add('no-gl');
    return;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uMouse = gl.getUniformLocation(prog, 'uMouse');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('mousemove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  const t0 = performance.now();
  function render(now) {
    resize();
    mouse.x = lerp(mouse.x, mouse.tx, 0.05); mouse.y = lerp(mouse.y, mouse.ty, 0.05);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reduceMotion ? 0 : (now - t0) / 1000);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function loop(now) {
    if (visible && !document.hidden) render(now);
    requestAnimationFrame(loop);
  }
  if (reduceMotion) { render(t0); window.addEventListener('resize', () => render(performance.now())); }
  else requestAnimationFrame(loop);
})();

/* ================= TEXT ROLL (label slides up, copy slides in) ================= */
function buildRoll(el) {
  if (!el || el.querySelector('.roll')) return;
  const txt = el.textContent.trim();
  el.textContent = '';
  const r = document.createElement('span'); r.className = 'roll';
  const a = document.createElement('span'); a.className = 'roll__t'; a.textContent = txt;
  const b = document.createElement('span'); b.className = 'roll__t roll__t--b'; b.textContent = txt; b.setAttribute('aria-hidden', 'true');
  r.append(a, b); el.appendChild(r);
}
$$('.nav__links a, .nav__cta > span, .btn:not(.form__submit) > span, .case-filter__btn, .footer__top').forEach(buildRoll);

/* ================= CURSOR + LERPED MOTION LOOP ================= */
const cursor = $('#cursor');
const dot = $('.cursor__dot'), ring = $('.cursor__ring'), shape = $('.cursor__shape');
const cursorLabel = $('#cursorLabel'), glow = $('#cursorGlow');
const cur = { x: -300, y: -300, rx: -300, ry: -300, gx: -300, gy: -300 };
const portrait = $('#portrait');
const look = { x: 0, y: 0, tx: 0, ty: 0 };
const magnets = [];
const tilts = [];
let stretchAngle = 0;

if (finePointer && !reduceMotion && cursor) {
  html.classList.add('has-cursor');
  let first = true;
  window.addEventListener('mousemove', (e) => {
    cur.x = e.clientX; cur.y = e.clientY;
    if (first) { cur.rx = cur.gx = cur.x; cur.ry = cur.gy = cur.y; first = false; }
    cursor.classList.remove('is-hidden');
    look.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    look.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  document.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
  window.addEventListener('mousedown', () => cursor.classList.add('is-down'));
  window.addEventListener('mouseup', () => cursor.classList.remove('is-down'));
  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    const labelled = t.closest('[data-cursor]');
    const link = t.closest('a, button, .chips span');
    if (labelled) cursorLabel.textContent = labelled.dataset.cursor;
    cursor.classList.toggle('has-label', !!labelled);
    cursor.classList.toggle('is-hover', !!link && !labelled);
    cursor.classList.toggle('is-card', !!t.closest('.case__tilt') && !link);
    cursor.classList.toggle('is-text', !!t.closest('input, textarea'));
  });
}

// Magnetic elements ease toward the pointer while it's near and spring back on leave
if (finePointer && !reduceMotion) {
  $$('[data-magnetic]').forEach((el) => {
    const m = { el, x: 0, y: 0, tx: 0, ty: 0 };
    magnets.push(m);
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      m.tx = (e.clientX - (r.left + r.width / 2)) * 0.32;
      m.ty = (e.clientY - (r.top + r.height / 2)) * 0.4;
    });
    el.addEventListener('mouseleave', () => { m.tx = 0; m.ty = 0; });
  });

  // ghost buttons fill from wherever the pointer enters / leaves
  $$('.btn--ghost').forEach((b) => {
    const set = (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--bx', `${e.clientX - r.left}px`);
      b.style.setProperty('--by', `${e.clientY - r.top}px`);
    };
    b.addEventListener('mouseenter', set);
    b.addEventListener('mouseleave', set);
  });
}

/* ---- marquee: base drift + scroll-velocity push (reverses when you scroll up) ---- */
const marqueeBox = $('.marquee');
const marqueeRows = $$('.marquee__row').map((row) => ({
  track: $('.marquee__track', row), dir: row.classList.contains('marquee__row--rev') ? 1 : -1, x: 0, w: 0, speed: 1,
}));
let marqueeHover = false;
function measureMarquee() {
  marqueeRows.forEach((r) => { r.w = r.track.scrollWidth / 2; if (r.dir > 0 && r.x === 0) r.x = -r.w; });
}
if (marqueeBox) {
  measureMarquee();
  window.addEventListener('resize', measureMarquee);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMarquee);
  marqueeBox.addEventListener('mouseenter', () => { marqueeHover = true; });
  marqueeBox.addEventListener('mouseleave', () => { marqueeHover = false; });
}
let lastScrollY = window.scrollY, scrollVel = 0;

/* ---- footer name lights up under the pointer ---- */
const footerEl = $('.footer'), giant = $('.footer__giant');
const flash = { x: 600, y: 900, tx: 600, ty: 900 };
if (footerEl && giant && finePointer && !reduceMotion) {
  footerEl.addEventListener('mousemove', (e) => {
    const r = giant.getBoundingClientRect();
    flash.tx = e.clientX - r.left; flash.ty = e.clientY - r.top;
  });
  footerEl.addEventListener('mouseleave', () => { flash.ty = giant.offsetHeight * 2.6; });
}

function motionLoop(time) {
  if (lenis) lenis.raf(time);

  if (html.classList.contains('has-cursor')) {
    cur.rx = lerp(cur.rx, cur.x, 0.17); cur.ry = lerp(cur.ry, cur.y, 0.17);
    cur.gx = lerp(cur.gx, cur.x, 0.055); cur.gy = lerp(cur.gy, cur.y, 0.055);
    dot.style.transform  = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
    ring.style.transform = `translate3d(${cur.rx}px, ${cur.ry}px, 0)`;
    glow.style.transform = `translate3d(${cur.gx}px, ${cur.gy}px, 0)`;

    // squash & stretch the ring along its direction of travel
    const dx = cur.x - cur.rx, dy = cur.y - cur.ry, sp = Math.hypot(dx, dy);
    if (sp > 0.6) stretchAngle = Math.atan2(dy, dx);
    const calm = cursor.classList.contains('is-hover') || cursor.classList.contains('is-card') || cursor.classList.contains('has-label');
    const k = Math.min(sp / 90, calm ? 0.1 : 0.42);
    shape.style.rotate = `${stretchAngle}rad`;
    shape.style.scale = `${(1 + k).toFixed(3)} ${(1 - k * 0.45).toFixed(3)}`;
  }

  if (portrait && !reduceMotion) {
    look.x = lerp(look.x, look.tx, 0.06); look.y = lerp(look.y, look.ty, 0.06);
    portrait.style.setProperty('--px', look.x.toFixed(3));
    portrait.style.setProperty('--py', look.y.toFixed(3));
  }

  for (const m of magnets) {
    if (Math.abs(m.x - m.tx) > 0.05 || Math.abs(m.y - m.ty) > 0.05) {
      m.x = lerp(m.x, m.tx, 0.16); m.y = lerp(m.y, m.ty, 0.16);
      m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
    }
  }

  for (const t of tilts) {
    if (Math.abs(t.tx - t.x) + Math.abs(t.ty - t.y) + Math.abs(t.tpx - t.px) + Math.abs(t.tpy - t.py) > 0.002) {
      t.x = lerp(t.x, t.tx, 0.11); t.y = lerp(t.y, t.ty, 0.11);
      t.px = lerp(t.px, t.tpx, 0.11); t.py = lerp(t.py, t.tpy, 0.11);
      t.el.style.setProperty('--ry', `${t.x.toFixed(3)}deg`);
      t.el.style.setProperty('--rx', `${t.y.toFixed(3)}deg`);
      t.el.style.setProperty('--tx', t.px.toFixed(3));
      t.el.style.setProperty('--ty', t.py.toFixed(3));
    }
  }

  if (!reduceMotion) {
    const sy = window.scrollY;
    scrollVel = lerp(scrollVel, sy - lastScrollY, 0.12);
    lastScrollY = sy;
    marqueeRows.forEach((r) => {
      if (!r.w) return;
      r.speed = lerp(r.speed, marqueeHover ? 0.2 : 1, 0.06);
      const push = clamp(scrollVel * 0.3, -16, 16);
      r.x += r.dir * (0.9 + push) * r.speed;
      while (r.x <= -r.w) r.x += r.w;
      while (r.x > 0) r.x -= r.w;
      r.track.style.transform = `translate3d(${r.x.toFixed(2)}px, 0, 0)`;
    });

    if (Math.abs(flash.x - flash.tx) + Math.abs(flash.y - flash.ty) > 0.3) {
      flash.x = lerp(flash.x, flash.tx, 0.12); flash.y = lerp(flash.y, flash.ty, 0.12);
      giant.style.setProperty('--fx', `${flash.x.toFixed(1)}px`);
      giant.style.setProperty('--fy', `${flash.y.toFixed(1)}px`);
    }
  }

  requestAnimationFrame(motionLoop);
}
requestAnimationFrame(motionLoop);

/* ================= SPOTLIGHT + 3D TILT ================= */
if (finePointer) {
  const setPointer = (el, e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  document.addEventListener('mousemove', (e) => {
    if (!e.target.closest) return;
    const chip = e.target.closest('.chips span');
    if (chip) setPointer(chip, e);
    const s = e.target.closest('.spot');
    if (s) setPointer(s, e);
  }, { passive: true });

  if (!reduceMotion) {
    $$('.case__tilt').forEach((card) => {
      const t = { el: card, x: 0, y: 0, tx: 0, ty: 0, px: 0, py: 0, tpx: 0, tpy: 0 };
      tilts.push(t);
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('is-tilting');
        t.tx = px * 9; t.ty = -py * 9; t.tpx = px * 2; t.tpy = py * 2;
      });
      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-tilting');
        t.tx = t.ty = t.tpx = t.tpy = 0;
      });
    });
  }
}

/* ================= SCROLL-DRIVEN: nav, progress, timeline, parallax ================= */
const nav = $('#nav');
const progressBar = $('#progress');
const timeline = $('#timeline');
const exps = $$('.exp');
const parallaxEls = $$('[data-parallax]');
const heroContent = $('.hero__content'), heroVisual = $('.hero__visual');
let ticking = false;

function onScroll() {
  const y = window.scrollY, vh = window.innerHeight;
  nav.classList.toggle('is-scrolled', y > 24);

  const scrollable = document.documentElement.scrollHeight - vh;
  progressBar.style.transform = `scaleX(${scrollable > 0 ? clamp(y / scrollable, 0, 1) : 0})`;

  if (timeline) {
    const r = timeline.getBoundingClientRect();
    timeline.style.setProperty('--p', clamp((vh * 0.65 - r.top) / r.height, 0, 1).toFixed(4));
    exps.forEach((ex) => ex.classList.toggle('is-lit', ex.getBoundingClientRect().top < vh * 0.65));
  }

  if (!reduceMotion && heroContent && y < vh * 1.3) {
    heroContent.style.translate = `0 ${(y * 0.16).toFixed(1)}px`;
    heroContent.style.opacity = (1 - clamp(y / (vh * 0.85), 0, 1)).toFixed(3);
    if (heroVisual) heroVisual.style.translate = `0 ${(y * 0.07).toFixed(1)}px`;
  }

  if (!reduceMotion && y < vh * 1.5) {
    parallaxEls.forEach((el) => { el.style.translate = `0 ${(y * parseFloat(el.dataset.parallax)).toFixed(1)}px`; });
  }
  ticking = false;
}
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

/* ================= NAV: sliding pill, scrollspy, mobile menu ================= */
const pill = $('#navPill');
const pillLinks = $$('.nav__links a');
const spyLinks = $$('[data-nav]');
let activeLink = null;

function movePill(a) {
  if (!pill) return;
  if (!a) { pill.style.opacity = 0; return; }
  pill.style.width = `${a.offsetWidth}px`;
  pill.style.transform = `translateX(${a.offsetLeft}px)`;
  pill.style.opacity = 1;
}
pillLinks.forEach((a) => a.addEventListener('mouseenter', () => movePill(a)));
$('.nav__links').addEventListener('mouseleave', () => movePill(activeLink));
window.addEventListener('resize', () => movePill(activeLink));

const spyTargets = [$('#hero'), ...spyLinks.map((l) => document.getElementById(l.dataset.nav))].filter(Boolean);
const spy = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const link = spyLinks.find((l) => l.dataset.nav === entry.target.id);
    spyLinks.forEach((l) => l.classList.remove('is-active'));
    if (link) link.classList.add('is-active');
    activeLink = link && pillLinks.includes(link) ? link : null;
    movePill(activeLink);
  });
}, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
spyTargets.forEach((s) => spy.observe(s));

const navToggle = $('#navToggle');
const mobileMenu = $('#mobileMenu');
function setMenu(open) {
  mobileMenu.classList.toggle('is-open', open);
  navToggle.classList.toggle('is-active', open);
  navToggle.setAttribute('aria-expanded', String(open));
  html.classList.toggle('no-scroll', open);
  if (lenis && !html.classList.contains('is-loading')) { if (open) lenis.stop(); else lenis.start(); }
}
navToggle.addEventListener('click', () => setMenu(!mobileMenu.classList.contains('is-open')));
$$('a', mobileMenu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

/* ================= ANCHOR LINKS (eased scroll) ================= */
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = id === '#hero' ? 0 : document.querySelector(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6, force: true, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else if (target === 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    else target.scrollIntoView({ behavior: 'smooth' });
  });
});

/* ================= REVEALS ================= */
// Stagger siblings that reveal together
const groups = new Map();
$$('.reveal').forEach((el) => {
  const key = el.parentElement;
  const n = groups.get(key) || 0;
  el.style.setProperty('--i', el.classList.contains('case') ? n % 2 : n);
  groups.set(key, n + 1);
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    el.classList.add('is-visible');
    revealObserver.unobserve(el);
    // once settled, drop the reveal transition so hover transforms on the element aren't delayed
    setTimeout(() => el.classList.remove('reveal'), 1500 + (parseFloat(el.style.getPropertyValue('--i')) || 0) * 110);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
$$('.reveal').forEach((el) => revealObserver.observe(el));

const splitObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-in');
    splitObserver.unobserve(entry.target);
  });
}, { threshold: 0.3 });
$$('.split-words').forEach((el) => splitObserver.observe(el));

const scrambleObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    scrambleObserver.unobserve(el);
    if (reduceMotion) { el.textContent = el.dataset.final; return; }
    scramble(el, el.dataset.final);
  });
}, { threshold: 0.6 });
scrambleEls.forEach((el) => scrambleObserver.observe(el));

/* ================= COUNT-UP ================= */
function animateCount(el) {
  const target = parseFloat(el.dataset.countTo);
  const suffix = el.dataset.suffix || '';
  const duration = 1600, start = performance.now();
  (function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = `${Math.round((1 - Math.pow(1 - p, 4)) * target)}${suffix}`;
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    if (reduceMotion) entry.target.textContent = `${entry.target.dataset.countTo}${entry.target.dataset.suffix || ''}`;
    else animateCount(entry.target);
    countObserver.unobserve(entry.target);
  });
}, { threshold: 0.5 });
$$('[data-count-to]').forEach((el) => countObserver.observe(el));

/* ================= HERO ROLE TYPEWRITER ================= */
const roles = ['AI Automation Engineer', 'Agentic AI Builder', 'Workflow Architect', 'Full-Stack Developer'];
function typeRoles() {
  const el = $('#roleText');
  if (!el || reduceMotion) return;
  let r = 0, c = roles[0].length, deleting = true;
  (function step() {
    const word = roles[r];
    el.textContent = word.slice(0, c);
    let delay = deleting ? 38 : 75;
    if (deleting && c === 0) { deleting = false; r = (r + 1) % roles.length; delay = 350; }
    else if (!deleting && c === roles[r].length) { deleting = true; delay = 1900; }
    else c += deleting ? -1 : 1;
    setTimeout(step, delay);
  })();
}

/* ================= PROJECT FILTER ================= */
const filterButtons = $$('.case-filter__btn');
const cases = $$('.case[data-category]');
filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterButtons.forEach((b) => { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');
    const f = btn.dataset.filter;
    cases.forEach((c, i) => {
      const match = f === 'all' || c.dataset.category === f;
      c.classList.toggle('is-filtered-out', !match);
      if (match) {
        c.classList.remove('is-entering'); void c.offsetWidth;
        c.style.animationDelay = `${i * 70}ms`;
        c.classList.add('is-entering');
        c.addEventListener('animationend', () => c.classList.remove('is-entering'), { once: true });
      }
    });
  });
});

/* ================= CONTACT FORM ================= */
const contactForm = $('#contactForm');
if (contactForm) {
  const statusEl = $('#formStatus');
  const submitBtn = $('.form__submit', contactForm);
  const submitText = $('.form__submit-text', contactForm);
  const ICON_OK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg>';
  const ICON_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitText.textContent = 'Sending…';
    statusEl.textContent = '';
    statusEl.className = 'form__status';
    try {
      const res = await fetch(contactForm.action, { method: 'POST', body: new FormData(contactForm), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('Submission failed');
      statusEl.innerHTML = `${ICON_OK}<span>Got it — I read every message myself. I'll be in touch soon.</span>`;
      statusEl.classList.add('is-success');
      contactForm.reset();
    } catch (err) {
      statusEl.innerHTML = `${ICON_ERR}<span>Something went wrong on my end — please email me directly instead.</span>`;
      statusEl.classList.add('is-error');
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = 'Send message';
    }
  });
}
})();
