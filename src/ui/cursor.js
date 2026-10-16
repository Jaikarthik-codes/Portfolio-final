import { gsap } from 'gsap';

const INTERACTIVE = 'a[href], button, [role="button"], [data-cursor]';

/**
 * Custom cursor: a milk diamond that tracks the pointer tightly and a hairline ring that lags behind.
 * Over links/buttons both turn orange and the ring opens up. Only on fine pointers with hover;
 * touch devices keep the native behaviour and the element is removed.
 *
 *   initCursor(el, { reducedMotion }) => { destroy() } | null
 */
export function initCursor(el, { reducedMotion = false } = {}) {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!el || !fine) {
    el?.remove();
    return null;
  }

  const html = document.documentElement;
  const dot = el.querySelector('.cursor__dot');
  const ring = el.querySelector('.cursor__ring');
  const lag = reducedMotion ? 0.12 : 0.55;

  const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3' });
  const ringX = gsap.quickTo(ring, 'x', { duration: lag, ease: 'power3' });
  const ringY = gsap.quickTo(ring, 'y', { duration: lag, ease: 'power3' });

  let shown = false;
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!shown) {
      // Jump into place on first move instead of flying in from the corner.
      gsap.set([dot, ring], { x: e.clientX, y: e.clientY });
      html.classList.add('has-cursor');
      shown = true;
    }
    el.classList.add('is-visible');
    dotX(e.clientX);
    dotY(e.clientY);
    ringX(e.clientX);
    ringY(e.clientY);
  };
  const onOver = (e) => el.classList.toggle('is-hover', !!e.target.closest?.(INTERACTIVE));
  const onDown = () => el.classList.add('is-down');
  const onUp = () => el.classList.remove('is-down');
  const onLeave = () => el.classList.remove('is-visible');

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerover', onOver, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  return {
    destroy() {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      html.classList.remove('has-cursor');
      el.remove();
    },
  };
}
