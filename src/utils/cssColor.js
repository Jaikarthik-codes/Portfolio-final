import * as THREE from 'three';

// Read a colour token from tokens.css so the 3D scene and the page share one palette.
export function cssColor(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value);
}
