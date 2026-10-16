import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { EASE } from './eases.js';

gsap.registerPlugin(SplitText);

/**
 * Intro (HUD + hero copy entrance) and heroOut (hero copy exit) timelines.
 *
 *   hideForIntro(els)                         hides every intro block (call once at init, before the loader exits)
 *   buildIntro(els, { reducedMotion, onStatus }) => paused Timeline, ≈2.4 s
 *   buildHeroOut(els, { reducedMotion })      => paused Timeline, exactly 1 s long so it maps cleanly onto a scrub
 *
 * `els` comes from queryElements(). Text is split lazily (after fonts load) the first time a timeline is built.
 */

export function queryElements(doc = document) {
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  return {
    brand: $('.brand'),
    seal: $('.brand__seal'),
    brandLines: $$('.brand__line > span'),
    navItems: $$('.nav__item'),
    navTexts: $$('.nav__text'),
    cta: $('.hud__cta'),
    ticks: $('.hud__ticks'),
    tickItems: $$('.ticks__tick'),
    counter: $('.counter'),
    counterRows: $$('.counter__row'),
    cue: $('.cue'),
    cueLine: $('.cue__line'),
    cueLabel: $('.cue__label'),
    status: $('.hud__status'),
    statusRows: $$('.status__head, .status__line'),
    eyebrow: $('.hero__eyebrow'),
    eyebrowText: $('.hero__eyebrow-text'),
    headline: $('.hero__headline'),
    lede: $('.hero__lede'),
    vertical: $('.hero__vertical'),
    kanji: $('.hero__kanji'),
    vrule: $('.hero__vrule'),
    romaji: $('.hero__romaji'),
    tagline: $('.hero__tagline'),
    taglineText: $('.hero__tagline-text'),
    diamonds: $$('.hero__diamond'),
  };
}

/** Every block the intro brings in. Hidden up front so nothing flashes while the shoji panels part. */
const introBlocks = (els) => [
  els.brand,
  ...els.navItems,
  els.cta,
  els.ticks,
  els.counter,
  els.cue,
  els.status,
  els.eyebrow,
  els.headline,
  els.lede,
  els.vertical,
  els.tagline,
];

export function hideForIntro(els) {
  gsap.set(introBlocks(els), { autoAlpha: 0 });
}

let splits = null;
function ensureSplits(els) {
  if (splits) return splits;
  splits = {
    // Headline lines are explicit spans (they double as masks), so only words/chars are split.
    headline: SplitText.create(els.headline, { type: 'words,chars', charsClass: 'split-char' }),
    // Lede wraps naturally: split into masked lines for the entrance, reverted once it has played.
    lede: SplitText.create(els.lede, { type: 'lines', mask: 'lines', linesClass: 'split-line' }),
    kanji: SplitText.create(els.kanji, { type: 'chars', charsClass: 'split-kanji' }),
    tagline: SplitText.create(els.taglineText, { type: 'chars', aria: 'none' }),
  };
  return splits;
}

export function buildIntro(els, { reducedMotion = false, onStatus } = {}) {
  const blocks = introBlocks(els);

  if (reducedMotion) {
    return gsap
      .timeline({ paused: true })
      .to(blocks, { autoAlpha: 1, duration: 0.8, ease: 'power1.out', stagger: 0.05 })
      .call(() => onStatus?.(), null, '>-0.4');
  }

  const s = ensureSplits(els);
  const tl = gsap.timeline({
    paused: true,
    defaults: { ease: EASE.out, duration: 1.2 },
    onComplete: () => s.lede.revert(), // let the paragraph reflow freely on resize from here on
  });

  // Nav: the hanko lands like a stamp, then the bar fills in from the left.
  tl.set(els.brand, { autoAlpha: 1 }, 0)
    .from(els.seal, { scale: 1.45, rotate: -12, autoAlpha: 0, duration: 0.85, ease: EASE.stamp }, 0)
    .from(els.brandLines, { yPercent: 105, duration: 1, stagger: 0.07 }, 0.2)
    .set(els.navItems, { autoAlpha: 1 }, 0.15)
    .from(els.navTexts, { yPercent: 110, duration: 1, stagger: 0.06 }, 0.15)
    .set(els.cta, { autoAlpha: 1 }, 0.35)
    .fromTo(
      els.cta,
      { clipPath: 'inset(100% 0% 0% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: EASE.inOut, clearProps: 'clipPath' },
      0.35,
    );

  // Hero copy: eyebrow, then the headline rises out of its line masks char by char, then the lede.
  tl.set(els.eyebrow, { autoAlpha: 1 }, 0.3)
    .from(els.eyebrowText, { yPercent: 110, duration: 1 }, 0.3)
    .set(els.headline, { autoAlpha: 1 }, 0.4)
    .from(s.headline.chars, { yPercent: 118, duration: 1.3, stagger: 0.016 }, 0.4)
    .set(els.lede, { autoAlpha: 1 }, 0.95)
    .from(s.lede.lines, { yPercent: 105, duration: 1.1, stagger: 0.07 }, 0.95);

  // Right edge: 天与呪縛 is "written" top to bottom; the red rule and romaji follow.
  tl.set(els.vertical, { autoAlpha: 1 }, 0.6)
    .from(s.kanji.chars, { autoAlpha: 0, yPercent: -24, duration: 1.5, stagger: 0.13 }, 0.6)
    .from(els.vrule, { scaleY: 0, duration: 1.4, ease: EASE.inOut }, 0.75)
    .fromTo(
      els.romaji,
      { clipPath: 'inset(0% 0% 100% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: EASE.inOut, clearProps: 'clipPath' },
      0.95,
    )
    .set(els.ticks, { autoAlpha: 1 }, 0.8)
    .from(els.tickItems, { scaleX: 0, duration: 1, stagger: 0.07 }, 0.8);

  // Bottom row: counter, cue, tagline and status card settle in last.
  tl.set(els.counter, { autoAlpha: 1 }, 0.95)
    .from(els.counterRows, { yPercent: 110, duration: 1, stagger: 0.05 }, 0.95)
    .set(els.cue, { autoAlpha: 1 }, 1.25)
    .from(els.cueLine, { scaleY: 0, transformOrigin: 'top center', duration: 1, ease: EASE.inOut }, 1.25)
    .from(els.cueLabel, { autoAlpha: 0, x: -10, duration: 1 }, 1.4)
    .set(els.tagline, { autoAlpha: 1 }, 1.05)
    .from(s.tagline.chars, { autoAlpha: 0, yPercent: 26, duration: 1.1, stagger: { each: 0.035, from: 'center' } }, 1.05)
    .from(els.diamonds, { scale: 0, rotate: -90, duration: 1, ease: EASE.out, stagger: 0.08 }, 1.35)
    .set(els.status, { autoAlpha: 1 }, 1.1)
    .fromTo(
      els.status,
      { clipPath: 'inset(0% 0% 0% 100%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: EASE.inOut, clearProps: 'clipPath' },
      1.1,
    )
    .from(els.statusRows, { autoAlpha: 0, y: 6, duration: 0.9, stagger: 0.1 }, 1.5)
    .call(() => onStatus?.(), null, 2.1);

  return tl;
}

export function buildHeroOut(els, { reducedMotion = false } = {}) {
  // immediateRender:false — this is built before it plays; it must not touch anything until scrubbed.
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.in', duration: 0.5, immediateRender: false } });

  if (reducedMotion) {
    tl.fromTo(
      [els.cue, els.eyebrow, els.headline, els.lede, els.vertical, els.tagline],
      { autoAlpha: 1 },
      { autoAlpha: 0, duration: 0.6, stagger: 0.06, ease: 'none' },
      0,
    );
    return tl.set({}, {}, 1);
  }

  const s = ensureSplits(els);
  tl.fromTo(els.cue, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2, ease: 'none' }, 0)
    .fromTo(els.eyebrowText, { yPercent: 0 }, { yPercent: -110, duration: 0.35 }, 0)
    .fromTo(s.headline.chars, { yPercent: 0 }, { yPercent: -118, duration: 0.42, stagger: 0.008 }, 0.04)
    .fromTo(els.lede, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -28, duration: 0.45 }, 0.12)
    .fromTo(s.kanji.chars, { autoAlpha: 1, yPercent: 0 }, { autoAlpha: 0, yPercent: 30, duration: 0.4, stagger: 0.06 }, 0.1)
    .fromTo([els.vrule, els.romaji], { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.35 }, 0.1)
    .fromTo(els.tagline, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: 24, duration: 0.45 }, 0.2);
  return tl.set({}, {}, 1);
}
