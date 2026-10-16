import { gsap } from 'gsap';

/**
 * Magnetic hover: the element leans toward the pointer and its [data-magnetic-inner] child leans a little further,
 * which gives the label a sense of depth. Releases with a long, soft settle (never springy).
 *
 *   magnetic(el, { strength = 0.32, inner = 0.16 }) => { destroy() }
 */
export function magnetic(el, { strength = 0.32, inner = 0.16 } = {}) {
  const label = el.querySelector('[data-magnetic-inner]');
  const to = (target, prop) => gsap.quickTo(target, prop, { duration: 0.7, ease: 'power3' });
  const x = to(el, 'x');
  const y = to(el, 'y');
  const lx = label && to(label, 'x');
  const ly = label && to(label, 'y');

  // Measure at enter, while the element is (nearly) at rest, so its own offset doesn't feed back into the math.
  let rect = null;
  const onEnter = () => {
    rect = el.getBoundingClientRect();
    const tx = gsap.getProperty(el, 'x');
    const ty = gsap.getProperty(el, 'y');
    rect = { cx: rect.left - tx + rect.width / 2, cy: rect.top - ty + rect.height / 2 };
  };
  const onMove = (e) => {
    if (!rect) onEnter();
    const dx = e.clientX - rect.cx;
    const dy = e.clientY - rect.cy;
    x(dx * strength);
    y(dy * strength);
    lx?.(dx * inner);
    ly?.(dy * inner);
  };
  const onLeave = () => {
    rect = null;
    x(0);
    y(0);
    lx?.(0);
    ly?.(0);
  };

  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);

  return {
    destroy() {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      gsap.set([el, label].filter(Boolean), { clearProps: 'transform' });
    },
  };
}
