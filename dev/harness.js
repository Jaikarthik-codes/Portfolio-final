/*
 * Isolated renderer for world modules, used for screenshots.
 *   /dev/harness.html?m=torii,lanterns   modules from src/world/ (or m=all)
 *   &cam=0,1.55,13.5&target=0,2.6,0      camera rig position + look-at
 *   &t=3                                 pre-simulate N seconds of updates
 *   &post=1                              render through src/fx/post.js if present
 *   &grid=1                              ground grid + axes for layout checks
 *   &blood=1                             lighting.setBlood value (default 1)
 *   &opts={"name":{...}}                 JSON options passed to each module's create(ctx, opts)
 */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Experience } from '../src/scene/Experience.js';
import createLighting from '../src/world/lighting.js';

const q = new URLSearchParams(location.search);
const vec = (s, fallback) => (s ? new THREE.Vector3(...s.split(',').map(Number)) : fallback);

const experience = new Experience(document.querySelector('.webgl'));
experience.parallax = 0;
experience.rig.position.copy(vec(q.get('cam'), experience.rig.position));
experience.target.copy(vec(q.get('target'), experience.target));

const ctx = experience.ctx;
const lighting = createLighting(ctx);
lighting.setBlood(Number(q.get('blood') ?? 1));
ctx.scene.add(lighting.object);

if (q.get('grid')) {
  ctx.scene.add(new THREE.GridHelper(60, 60, '#c52b27', '#153b54'), new THREE.AxesHelper(3));
}

const available = import.meta.glob('../src/world/*.js');
const key = (name) => `../src/world/${name}.js`;
let names = (q.get('m') ?? '').split(',').filter(Boolean);
if (names.includes('all')) {
  names = Object.keys(available)
    .map((p) => p.match(/world\/(.+)\.js$/)[1])
    .filter((n) => n !== 'lighting' && !n.startsWith('_'));
}
const opts = q.get('opts') ? JSON.parse(q.get('opts')) : {};

const mods = {};
for (const name of names) {
  if (!available[key(name)]) throw new Error(`No module src/world/${name}.js`);
  const { default: create } = await available[key(name)]();
  const mod = await create(ctx, opts[name] ?? {});
  ctx.scene.add(mod.object);
  if (mod.update) experience.onUpdate(mod.update);
  mods[name] = mod;
}

if (q.get('post')) {
  const fx = import.meta.glob('../src/fx/post.js');
  if (fx['../src/fx/post.js']) {
    const { createPost } = await fx['../src/fx/post.js']();
    experience.setPost(await createPost(ctx, { mods }));
  }
}

// Pre-simulate so particles/animations are mid-flight in screenshots.
const simulate = Number(q.get('t') ?? 0);
for (let s = 0; s < simulate; s += 1 / 60) {
  for (const fn of experience.updaters) fn(s, 1 / 60);
}

let frames = 0;
gsap.ticker.add((time, deltaTime) => {
  experience.update(simulate + time, Math.min(deltaTime / 1000, 1 / 30));
  if (++frames === 4) {
    const { calls, triangles } = experience.renderer.info.render;
    window.__stats = { calls, triangles };
    document.fonts.ready.then(() => (window.__ready = true));
  }
});

window.__harness = { experience, lighting, mods, THREE, gsap };
