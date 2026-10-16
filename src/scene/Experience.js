import * as THREE from 'three';
import { palette } from '../theme/palette.js';

function detectQuality() {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'low' || forced === 'high') return forced;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || fewCores ? 'low' : 'high';
}

/**
 * Owns the renderer, camera and frame loop. World modules add objects to `scene`
 * and register per-frame work with `onUpdate`.
 *
 * Camera model: scroll/intro timelines tween `rig.position` and `target`;
 * pointer parallax offsets the camera inside the rig; the camera always looks at `target`.
 */
export class Experience {
  constructor(canvas, { reducedMotion = false, quality = detectQuality() } = {}) {
    this.reducedMotion = reducedMotion;
    this.quality = quality;
    this.palette = palette;
    this.scene = new THREE.Scene();

    this.rig = new THREE.Group();
    this.rig.position.set(0, 1.55, 13.5);
    this.target = new THREE.Vector3(0, 2.6, 0);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(palette.ink, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;

    this.pointer = new THREE.Vector2();
    this.parallax = reducedMotion ? 0 : 1;
    this.updaters = [];
    this.post = null;

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    this.resize();
  }

  /** Context handed to every world module's create(). */
  get ctx() {
    const { scene, camera, renderer, palette, quality, reducedMotion } = this;
    return { THREE, scene, camera, renderer, palette, quality, reducedMotion, experience: this };
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  /** Hand rendering over to a post-processing pipeline (see src/fx/post.js). */
  setPost(post) {
    this.post = post;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.resize();
  }

  resize() {
    const { innerWidth: width, innerHeight: height } = window;
    const pixelRatio = Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.5);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height);
  }

  update(time, delta) {
    const ease = 1 - Math.exp(-delta * 3);
    this.camera.position.x += (this.pointer.x * 0.35 * this.parallax - this.camera.position.x) * ease;
    this.camera.position.y += (this.pointer.y * 0.2 * this.parallax - this.camera.position.y) * ease;
    this.camera.lookAt(this.target);

    for (const fn of this.updaters) fn(time, delta);

    if (this.post) this.post.render(delta);
    else this.renderer.render(this.scene, this.camera);
  }
}
