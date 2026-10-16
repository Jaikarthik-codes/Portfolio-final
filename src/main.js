import './styles/fonts.js';
import './styles/main.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initScroll } from './scroll.js';
import { Experience } from './scene/Experience.js';
import { initHero } from './sections/hero.js';
import { initUI } from './ui/index.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The intro assumes the top of the page.
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const ui = initUI({ reducedMotion });
const lenis = initScroll({ smooth: !reducedMotion });
lenis?.stop();

const experience = new Experience(document.querySelector('.webgl'), { reducedMotion });
gsap.ticker.add((time, deltaTime) => experience.update(time, Math.min(deltaTime / 1000, 1 / 20)));

async function start() {
  const hero = await initHero(experience, { onProgress: (p) => ui.loader.setProgress(p * 0.92) });
  ui.loader.setProgress(1);
  await ui.ready;

  const exit = ui.loader.exit();
  exit.add(hero.intro(), 'open-=0.15');
  exit.add(() => ui.intro().play(), 'open+=1.6');
  exit.eventCallback('onComplete', () => {
    hero.enableScroll(ui);
    // Section counter / ticks follow whichever chapter holds the middle of the screen.
    document.querySelectorAll('[data-section]').forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top center',
        end: 'bottom center',
        onToggle: (self) => self.isActive && ui.setSection(Number(el.dataset.section)),
      });
    });
    ScrollTrigger.refresh();
    lenis?.start();
  });
}

start();
