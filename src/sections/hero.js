import * as THREE from 'three';
import { gsap } from 'gsap';
import { cssColor } from '../utils/cssColor.js';

// Placeholder hero: a stand-in object and a scroll timeline, to be replaced once designed.
export function initHero(experience) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.4, 1),
    new THREE.MeshStandardMaterial({ color: cssColor('--color-accent'), roughness: 0.35, flatShading: true }),
  );
  group.add(mesh);
  experience.scene.add(group);

  if (!experience.reducedMotion) {
    experience.onUpdate((time, delta) => {
      mesh.rotation.y += delta * 0.2;
    });
  }

  gsap
    .timeline({
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
      defaults: { ease: 'none' },
    })
    .to(group.rotation, { x: Math.PI * 0.5 }, 0)
    .to(experience.rig.position, { z: -3 }, 0)
    .to('#hero > *', { yPercent: -60, autoAlpha: 0, stagger: 0.05 }, 0);
}
