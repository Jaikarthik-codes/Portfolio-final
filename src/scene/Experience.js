import * as THREE from 'three';

// Owns the renderer, camera and frame loop. Sections add their own objects to `scene`
// and register per-frame work with `onUpdate`.
export class Experience {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.scene = new THREE.Scene();

    // Scroll timelines animate the rig; pointer parallax nudges the camera inside it,
    // so the two never fight over the same property.
    this.rig = new THREE.Group();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.z = 8;
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    // Transparent canvas: the page background (from tokens.css) shows through.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(3, 4, 5);
    this.scene.add(key);

    this.pointer = new THREE.Vector2();
    this.updaters = [];

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    this.resize();
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  resize() {
    const { innerWidth: width, innerHeight: height } = window;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
  }

  update(time, delta) {
    if (!this.reducedMotion) {
      const ease = 1 - Math.exp(-delta * 4);
      this.camera.position.x += (this.pointer.x * 0.3 - this.camera.position.x) * ease;
      this.camera.position.y += (this.pointer.y * 0.2 - this.camera.position.y) * ease;
    }

    for (const fn of this.updaters) fn(time, delta);
    this.renderer.render(this.scene, this.camera);
  }
}
