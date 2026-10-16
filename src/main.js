import './styles/main.css';
import { gsap } from 'gsap';
import { initScroll } from './scroll.js';
import { Experience } from './scene/Experience.js';
import { initHero } from './sections/hero.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

initScroll({ smooth: !reducedMotion });

const experience = new Experience(document.querySelector('.webgl'), { reducedMotion });
gsap.ticker.add((time, deltaTime) => experience.update(time, deltaTime / 1000));

// One init per section, added as each section is built.
initHero(experience);
