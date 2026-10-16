import { gsap } from 'gsap';
import createLighting from '../world/lighting.js';
import createSky from '../world/sky.js';
import createMoon from '../world/moon.js';
import createForest from '../world/forest.js';
import createGround from '../world/ground.js';
import createTorii from '../world/torii.js';
import createLanterns from '../world/lanterns.js';
import createAtmosphere from '../world/atmosphere.js';
import createName from '../world/name.js';
import createToji from '../world/toji.js';
import { createPost } from '../fx/post.js';

const art = (file) => `${import.meta.env.BASE_URL}assets/${file}`;
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// Camera keyframes: [rig position, look-at target].
const SHOTS = {
  intro: [{ x: 0, y: 3.2, z: 26 }, { x: 0, y: 3.5, z: -10 }],
  rest: [{ x: 0, y: 1.55, z: 13.5 }, { x: 0, y: 2.6, z: 0 }],
  approach: [{ x: 0.5, y: 1.05, z: 9.6 }, { x: 0, y: 1.95, z: 2 }],
  reveal: [{ x: 0.35, y: 1.25, z: 7.7 }, { x: 0, y: 1.65, z: 4.2 }],
  pass: [{ x: 1.8, y: 1.75, z: 4.4 }, { x: 0, y: 2.6, z: -6 }],
  gate: [{ x: 0.1, y: 2.3, z: 0.4 }, { x: 0, y: 3.6, z: -24 }],
};
// Far → near, so the ignition travels toward the viewer.
const IGNITION_ORDER = [4, 5, 2, 3, 0, 1];

/**
 * Builds the hero world and returns its two timelines:
 *   intro()            plays once after the loader (camera glides in, moon bleeds red, lanterns ignite, name rises)
 *   enableScroll(ui)   pinned scroll: Toji walks out of the gate → blood flash reveal → camera slips through the gate
 */
export async function initHero(experience, { onProgress = () => {} } = {}) {
  const ctx = experience.ctx;
  const { scene, rig, target, reducedMotion } = { ...ctx, rig: experience.rig, target: experience.target };
  const steps = 10;
  let done = 0;
  const add = async (mod) => {
    scene.add(mod.object);
    if (mod.update) experience.onUpdate(mod.update);
    onProgress(++done / steps);
    await frame(); // let the loader repaint between heavy builds
    return mod;
  };

  const lighting = await add(createLighting(ctx));
  const sky = await add(createSky(ctx));
  const moon = await add(createMoon(ctx));
  await add(createForest(ctx));
  await add(createGround(ctx));
  await add(createTorii(ctx));
  const lanterns = await add(createLanterns(ctx, { lit: 0 }));
  const atmosphere = await add(createAtmosphere(ctx));
  const [name, toji, smirk] = await Promise.all([
    createName(ctx, {
      rise: 0,
      // "Mylapur" spans the gap like a lintel, so Toji walks out beneath the full name.
      words: {
        mylapur: { cap: 0.48, position: [0, 2.3, 3.1], align: 'center', yaw: 0 },
        jai: { cap: 1.8, position: [-1.2, 0, 3.4] },
        karthik: { cap: 1.8, position: [1.2, 0, 3.4] },
      },
    }),
    createToji(ctx, { src: art('toji-walk.webp'), rim: 1.7 }),
    createToji(ctx, { src: art('toji-smirk.webp'), rim: 1.7, shadow: 0, longShadow: 0 }),
  ]);
  for (const mod of [name, toji]) await add(mod);
  scene.add(smirk.object);
  experience.onUpdate(smirk.update);
  smirk.uniforms.uOpacity.value = 0;
  // The art's white hakama would otherwise bloom into a halo up close.
  for (const t of [toji, smirk]) t.uniforms.uExposure.value = 0.58;

  const post = await createPost(ctx, { mods: { moon } });
  experience.setPost(post);

  // Start of the intro: pale moon, cold lanterns, letters underground, camera far back.
  const state = { blood: 0, rise: 0, walk: 0 };
  const applyBlood = () => [sky, moon, lighting].forEach((m) => m.setBlood(state.blood));
  const applyWalk = () => (toji.walk = smirk.walk = state.walk);
  rig.position.set(...Object.values(SHOTS.intro[0]));
  target.set(...Object.values(SHOTS.intro[1]));
  applyBlood();

  function intro() {
    const tl = gsap.timeline();
    if (reducedMotion) {
      return tl.call(() => {
        rig.position.set(...Object.values(SHOTS.rest[0]));
        target.set(...Object.values(SHOTS.rest[1]));
        state.blood = 1;
        applyBlood();
        lanterns.setAllLit(1);
        name.setRise(1);
      });
    }
    tl.to(rig.position, { ...SHOTS.rest[0], duration: 3.8, ease: 'expo.inOut' }, 0)
      .to(target, { ...SHOTS.rest[1], duration: 3.8, ease: 'expo.inOut' }, 0)
      .to(state, { blood: 1, duration: 2.6, ease: 'power1.inOut', onUpdate: applyBlood }, 0.2);
    IGNITION_ORDER.forEach((i, k) => {
      tl.to(lanterns.lanterns[i], { lit: 1, duration: 0.7, ease: 'power3.out' }, 1.0 + k * 0.22);
    });
    tl.to(state, { rise: 1, duration: 2.2, ease: 'power3.out', onUpdate: () => name.setRise(state.rise) }, 1.7);
    return tl;
  }

  function enableScroll(ui) {
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '#hero', start: 'top top', end: '+=360%', scrub: 1.2, pin: true, anticipatePin: 1 },
    });
    if (ui) tl.add(ui.heroOut().paused(false), 0);

    // Walk out through the gate and between the letters.
    tl.to(state, { walk: 0.78, duration: 6, onUpdate: applyWalk }, 0)
      .to(rig.position, { ...SHOTS.approach[0], duration: 6, ease: 'power1.inOut' }, 0)
      .to(target, { ...SHOTS.approach[1], duration: 6, ease: 'power1.inOut' }, 0)
      .to(name.words.jai.group.position, { x: '-=0.45', duration: 2.4, ease: 'power2.inOut' }, 3.8)
      .to(name.words.karthik.group.position, { x: '+=0.45', duration: 2.4, ease: 'power2.inOut' }, 3.8)
      .to(atmosphere, { gust: 1, duration: 0.8, ease: 'power2.out', yoyo: true, repeat: 1 }, 4.4);

    // Reveal: blood flash hides the cut to the smirk.
    tl.to(post.params, { flash: 0.6, duration: 0.25, ease: 'power2.in', yoyo: true, repeat: 1 }, 6)
      .set(toji.uniforms.uOpacity, { value: 0 }, 6.25)
      .set(smirk.uniforms.uOpacity, { value: 1 }, 6.25)
      .to(state, { walk: 0.83, duration: 1.6, ease: 'power2.out', onUpdate: applyWalk }, 6)
      .to(rig.position, { ...SHOTS.reveal[0], duration: 1.6, ease: 'power2.out' }, 6)
      .to(target, { ...SHOTS.reveal[1], duration: 1.6, ease: 'power2.out' }, 6)
      .to(lanterns, { flicker: 0.32, duration: 1.6 }, 6);

    // Exit: slip past him and push through the gate, then fade to ink for the next chapter.
    tl.to(rig.position, { ...SHOTS.pass[0], duration: 1.1, ease: 'power1.in' }, 8)
      .to(target, { ...SHOTS.pass[1], duration: 1.1, ease: 'power1.in' }, 8)
      .to(rig.position, { ...SHOTS.gate[0], duration: 1.3, ease: 'power2.out' }, 9.1)
      .to(target, { ...SHOTS.gate[1], duration: 1.3, ease: 'power2.out' }, 9.1)
      .to(post.params, { fade: 1, duration: 0.9, ease: 'power1.in' }, 9.5);
    return tl;
  }

  return { intro, enableScroll, mods: { lighting, sky, moon, lanterns, atmosphere, name, toji, smirk }, post };
}
