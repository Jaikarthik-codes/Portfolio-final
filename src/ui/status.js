import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(ScrambleTextPlugin);

const FOCUS = ['machine learning', 'LLM apps', 'computer vision', 'python · pytorch'];

/**
 * Status card line: cycles through focus areas, decoding each one with ScrambleText.
 * Reduced motion swaps the words with a plain cross-fade instead.
 *
 *   createStatusCycle(textEl, { reducedMotion, hold = 2.6 }) => { start(), stop() }
 */
export function createStatusCycle(textEl, { reducedMotion = false, hold = 2.6, phrases = FOCUS } = {}) {
  let index = 0;
  let pending = null;
  let tween = null;

  const schedule = () => {
    pending = gsap.delayedCall(hold, next);
  };

  function next() {
    index = (index + 1) % phrases.length;
    const text = phrases[index];
    if (reducedMotion) {
      tween = gsap
        .timeline({ onComplete: schedule })
        .to(textEl, { opacity: 0, duration: 0.3, ease: 'power1.in' })
        .call(() => (textEl.textContent = text))
        .to(textEl, { opacity: 1, duration: 0.4, ease: 'power1.out' });
      return;
    }
    tween = gsap.to(textEl, {
      duration: 1.1,
      ease: 'none',
      scrambleText: { text, chars: '01<>/_-', speed: 0.55, revealDelay: 0.25 },
      onComplete: schedule,
    });
  }

  return {
    start() {
      if (pending || tween?.isActive()) return;
      schedule();
    },
    stop() {
      pending?.kill();
      tween?.kill();
      pending = tween = null;
    },
  };
}
