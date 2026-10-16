import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { mergeGeometries };

/** Seeded PRNG so layouts are identical on every load. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** Smooth-ish 3D value in 0..1 built from sines — plenty for vertex weathering. */
export function wobble(x, y, z) {
  return (Math.sin(x * 1.7 + Math.sin(z * 0.9) * 2) * Math.sin(y * 2.3 + x * 0.5) * Math.sin(z * 1.3 + y * 0.7) + 1) * 0.5;
}

/**
 * Bake weathering into vertex colours (world-space after `geometry.applyMatrix4`):
 * grime darkens toward the ground, moss creeps over upward-facing surfaces.
 */
export function weather(geometry, { base, grime, moss, grimeHeight = 2, mossAmount = 0.45, jitter = 0.12 }) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const b = new THREE.Color(base);
  const g = new THREE.Color(grime);
  const m = moss ? new THREE.Color(moss) : null;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = wobble(x * 2.1, y * 2.7, z * 2.3);
    c.copy(b).lerp(g, THREE.MathUtils.clamp(1 - y / grimeHeight, 0, 1) * 0.85 + (n - 0.5) * jitter * 2);
    if (m && nor.getY(i) > 0.45 && n > 1 - mossAmount) c.lerp(m, 0.75);
    c.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Solid-coloured copy of a geometry (vertex colours), so differently coloured parts can merge into one mesh. */
export function tint(geometry, color) {
  const c = new THREE.Color(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

let leaf;
/** White maple-leaf alpha texture (tinted per instance). */
export function leafTexture() {
  if (leaf) return leaf;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.translate(size / 2, size * 0.56);
  g.fillStyle = '#fff';
  g.beginPath();
  // Seven lobes, the top three longest, with serrated tips.
  const lobes = [
    [-90, 0.46], [-45, 0.42], [-135, 0.42], [0, 0.32], [180, 0.32], [40, 0.2], [140, 0.2],
  ].sort((a, b) => a[0] - b[0]);
  const pts = [];
  for (const [deg, len] of lobes) {
    const a = (deg * Math.PI) / 180;
    for (const [da, r] of [[-0.32, 0.28], [-0.12, 0.8], [-0.05, 0.7], [0, 1], [0.05, 0.7], [0.12, 0.8], [0.32, 0.28]]) {
      pts.push([Math.cos(a + da) * len * r * size, Math.sin(a + da) * len * r * size]);
    }
  }
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.fillRect(-1.5, 0, 3, size * 0.32); // stem
  leaf = new THREE.CanvasTexture(canvas);
  leaf.colorSpace = THREE.SRGBColorSpace;
  return leaf;
}
