import { createLoader } from './loader.js';
import { initGrain } from './grain.js';
import { initCursor } from './cursor.js';
import { magnetic } from './magnetic.js';
import { createStatusCycle } from './status.js';
import { queryElements, hideForIntro, buildIntro, buildHeroOut } from './timelines.js';

/**
 * Editorial HTML overlay over the WebGL canvas: preloader, film grain, cursor, nav, hero copy, HUD.
 * Markup lives in index.html, styles in src/styles/*.css; this wires the motion.
 *
 *   const ui = initUI({ reducedMotion })
 *
 *   ui.ready                Promise — UI fonts (incl. the Japanese glyphs) are loaded; await before ui.intro()
 *   ui.loader.setProgress(p) p 0..1, monotonic; the ensō and % ease toward it
 *   ui.loader.exit()        => Timeline (playing). Labels 'seam', 'open', 'done'. Scroll unlocks at 'open'.
 *   ui.intro()              => paused Timeline (~2.4 s): HUD + hero copy entrance. Same instance on every call.
 *   ui.heroOut()            => paused Timeline, exactly 1 s: hero copy exit, built to be scrubbed (immediateRender off).
 *   ui.setSection(n)        n = section number as in data-section (1 The Gate … 5 Contract); drives counter + ticks.
 *
 * Typical integration:
 *   const exit = ui.loader.exit();
 *   exit.add(() => ui.intro().play(), 'open+=0.2');
 *   heroTimeline.add(ui.heroOut(), 0);   // inside the pinned hero ScrollTrigger timeline
 */
export function initUI({ reducedMotion = false } = {}) {
  // The intro always starts at the gate; don't restore a mid-page scroll under the preloader.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  const els = queryElements();
  hideForIntro(els);

  initGrain(document.querySelector('.grain'));
  initCursor(document.querySelector('.cursor'), { reducedMotion });
  if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => magnetic(el));
  }

  const loader = createLoader(document.querySelector('.loader'), { reducedMotion });
  const status = createStatusCycle(document.querySelector('.status__text'), { reducedMotion });

  const ready = Promise.all([
    document.fonts.load('500 1em "Shippori Mincho"', '天与呪縛鳥居起源'),
    document.fonts.load('700 1em "Shippori Mincho"', '門'),
    document.fonts.load('1em "Pirata One"', 'Aspiring AI Developer JK'),
    document.fonts.load('760 1em "Manrope Variable"', 'ZERO CURSED'),
    document.fonts.load('500 1em "JetBrains Mono"', 'THE GATE 01'),
    document.fonts.load('400 1em "JetBrains Mono"', '> machine'),
  ])
    .catch(() => {})
    .then(() => document.fonts.ready);

  let intro = null;
  let heroOut = null;

  const counterItems = [...document.querySelectorAll('.counter__item')];
  const ticks = els.tickItems;
  let current = 1;

  function setSection(n) {
    const next = Math.min(counterItems.length, Math.max(1, Math.round(Number(n) || 1)));
    if (next === current) return;
    current = next;
    counterItems.forEach((item, i) => {
      const active = i === next - 1;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    ticks.forEach((tick, i) => tick.classList.toggle('is-active', i === next - 1));
  }

  return {
    ready,
    loader,
    intro() {
      intro ??= buildIntro(els, { reducedMotion, onStatus: () => status.start() });
      return intro;
    },
    heroOut() {
      heroOut ??= buildHeroOut(els, { reducedMotion });
      return heroOut;
    },
    setSection,
  };
}
