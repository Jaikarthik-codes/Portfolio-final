import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

/**
 * Named eases for all UI motion. Long, decelerating outs and symmetric in-outs; nothing overshoots.
 * The CSS mirrors (--ease-out, --ease-in-out in tokens.css) keep hover transitions in the same family.
 */
export const EASE = {
  /** Reveal: fast start, very long settle (expo-like). */
  out: CustomEase.create('jk.out', '0.16, 1, 0.3, 1'),
  /** Doors, wipes and panel moves. */
  inOut: CustomEase.create('jk.inOut', '0.76, 0, 0.24, 1'),
  /** Exits that should leave quickly without a hard snap. */
  in: CustomEase.create('jk.in', '0.55, 0, 0.75, 0.2'),
  /** Hanko press: lands hard, settles short. */
  stamp: CustomEase.create('jk.stamp', '0.2, 0.9, 0.25, 1'),
};
