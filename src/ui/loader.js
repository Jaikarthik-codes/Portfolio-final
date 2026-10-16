import { gsap } from 'gsap';
import { EASE } from './eases.js';
import { ensoPaths } from './enso.js';

/**
 * Preloader: an ink screen where a vermilion ensō is brushed around 門 as loading progresses.
 * Exit: the ensō lifts away, a red hairline flashes at the centre seam and the screen parts as two shoji panels.
 *
 *   createLoader(root, { reducedMotion }) => {
 *     el,
 *     setProgress(p)   p 0..1 — the drawn value eases toward p, so coarse loader events still look continuous
 *     exit()           => gsap.core.Timeline, playing. Labels: 'seam' (hairline appears), 'open' (panels start
 *                         to slide; scroll unlocks here — start the intro around 'open+=0.2'), 'done'.
 *                         Calling exit() again returns the same timeline.
 *   }
 */
export function createLoader(root, { reducedMotion = false } = {}) {
  const svg = root.querySelector('.loader__enso');
  const kanji = root.querySelector('.loader__kanji');
  const digits = root.querySelector('.loader__digits');
  const mark = root.querySelector('.loader__mark');
  const count = root.querySelector('.loader__count');
  const name = root.querySelector('.loader__name');
  const panels = root.querySelectorAll('.loader__panel');
  const edges = root.querySelectorAll('.loader__edge');
  const flash = root.querySelector('.loader__flash');

  const { body, spine, streaks } = ensoPaths();
  svg.innerHTML = `
    <defs>
      <filter id="enso-ink" x="-8%" y="-8%" width="116%" height="116%">
        <feTurbulence type="fractalNoise" baseFrequency="0.032" numOctaves="3" seed="4" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="9" xChannelSelector="R" yChannelSelector="G" result="shape" />
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="9" result="fibre" />
        <feColorMatrix in="fibre" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -7 0 0 0 5.3" result="fibreMask" />
        <feComposite in="shape" in2="fibreMask" operator="in" />
      </filter>
      <mask id="enso-dry" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
        <rect width="400" height="400" fill="#fff" />
        <g fill="none" stroke="#000" stroke-linecap="round">
          ${streaks.map((s) => `<path d="${s.d}" stroke-width="${s.width}" stroke-dasharray="${s.dash}" />`).join('')}
        </g>
      </mask>
      <mask id="enso-reveal" maskUnits="userSpaceOnUse" x="-20" y="-20" width="440" height="440">
        <path class="loader__spine" d="${spine}" pathLength="1" fill="none" stroke="#fff" stroke-width="64"
          stroke-linecap="round" stroke-dasharray="1 1.01" stroke-dashoffset="1" />
      </mask>
    </defs>
    <circle class="loader__enso-guide" cx="200" cy="200" r="186" />
    <g class="loader__enso-ticks">
      <line class="loader__enso-tick" x1="200" y1="6" x2="200" y2="20" />
      <line class="loader__enso-tick" x1="380" y1="200" x2="394" y2="200" />
      <line class="loader__enso-tick" x1="200" y1="380" x2="200" y2="394" />
      <line class="loader__enso-tick" x1="6" y1="200" x2="20" y2="200" />
    </g>
    <g class="loader__brush" mask="url(#enso-reveal)">
      <g filter="url(#enso-ink)">
        <path class="loader__enso-body" d="${body}" mask="url(#enso-dry)" />
      </g>
    </g>`;
  const spinePath = svg.querySelector('.loader__spine');
  const brush = svg.querySelector('.loader__brush');

  const state = { value: 0 };
  let target = 0;
  let exitTimeline = null;

  const render = () => {
    const p = state.value;
    spinePath.style.strokeDashoffset = String(1 - p);
    // Zero-length dash still paints a round cap; hide the brush until there is something to show.
    brush.style.visibility = p > 0.002 ? 'visible' : 'hidden';
    kanji.style.setProperty('--p', p.toFixed(3));
    const pct = Math.round(p * 100);
    digits.textContent = String(pct).padStart(3, '0');
    root.setAttribute('aria-valuenow', String(pct));
  };
  render();

  // Reveal 門 only once its glyph is actually loaded, so there is never a tofu or fallback flash.
  document.fonts
    .load('700 120px "Shippori Mincho"', '門')
    .catch(() => {})
    .then(() => gsap.to(kanji, { opacity: 1, duration: reducedMotion ? 0.3 : 1.4, ease: EASE.out }));

  // Ease the drawn value toward the target every frame. (A tween per setProgress call would be overwritten
  // before it ever rendered when progress is reported every frame.)
  const approach = (time, deltaMs) => {
    const diff = target - state.value;
    if (Math.abs(diff) < 0.0005) {
      if (state.value !== target) (state.value = target), render();
      return;
    }
    state.value += diff * (1 - Math.exp((-Math.min(deltaMs, 100) / 1000) * (reducedMotion ? 18 : 4.2)));
    render();
  };
  gsap.ticker.add(approach);

  function setProgress(p) {
    target = Math.min(1, Math.max(target, Number(p) || 0)); // never runs backwards
  }

  function exit() {
    if (exitTimeline) return exitTimeline;
    gsap.ticker.remove(approach);
    const html = document.documentElement;
    const tl = gsap.timeline({ onComplete: () => root.classList.add('is-done') });

    // Finish the stroke first if loading completed faster than the drawing.
    tl.to(state, { value: 1, duration: reducedMotion ? 0.1 : 0.5 + (1 - state.value) * 0.6, ease: 'power2.inOut', onUpdate: render });

    if (reducedMotion) {
      tl.addLabel('seam')
        .addLabel('open')
        .call(() => html.classList.remove('is-loading'))
        .to(root, { autoAlpha: 0, duration: 0.6, ease: 'power1.out' })
        .addLabel('done');
      exitTimeline = tl;
      return tl;
    }

    tl.to(mark, { scale: 1.06, duration: 0.5, ease: EASE.out }, '+=0.12')
      .to(mark, { autoAlpha: 0, scale: 0.94, duration: 0.55, ease: EASE.in }, '>-0.1')
      .to([count, name], { autoAlpha: 0, y: -10, duration: 0.45, ease: EASE.in, stagger: 0.05 }, '<')
      .addLabel('seam', '>-0.1')
      .to(edges, { opacity: 1, scaleY: 1, duration: 0.6, ease: EASE.out }, 'seam')
      .fromTo(flash, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out', yoyo: true, repeat: 1 }, 'seam+=0.28')
      .addLabel('open', 'seam+=0.5')
      .call(() => html.classList.remove('is-loading'), null, 'open')
      .to(panels[0], { xPercent: -101, duration: 1.45, ease: EASE.inOut }, 'open')
      .to(panels[1], { xPercent: 101, duration: 1.45, ease: EASE.inOut }, 'open')
      .to(edges, { opacity: 0, duration: 0.9, ease: 'power2.in' }, 'open+=0.35')
      .addLabel('done');

    exitTimeline = tl;
    return tl;
  }

  return { el: root, setProgress, exit };
}
