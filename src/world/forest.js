import * as THREE from 'three';
import { mergeGeometries, tint, rng } from './util.js';
import { heightAt } from './ground.js';

const MAPLES = [[-5.5, 1], [6, -2], [-8, 6], [8.5, 5], [-4.5, -24], [5, -26]];

/**
 * Cedar forest framing the gate (instanced, one draw call), red maples as colour accents, the shrine hall on the
 * terrace with glowing shoji, and layered ridge silhouettes. The moon's line of sight from the hero camera is kept clear.
 * API: { object, shrine, maples }
 */
export default function create({ palette, quality }, { camera = [0, 1.55, 13.5], moon = [14, 26, -95] } = {}) {
  const group = new THREE.Group();
  group.name = 'forest';
  const rand = rng(31);
  const cam = new THREE.Vector3(...camera);
  const moonV = new THREE.Vector3(...moon);

  // Cedar: trunk + stacked cones, coloured per part, normalised to ~12 m.
  const cedarParts = [tint(new THREE.CylinderGeometry(0.14, 0.26, 7, 6).translate(0, 3.5, 0), '#2a1d16')];
  for (let k = 0; k < 5; k++) {
    const r = 2.1 - k * 0.36;
    cedarParts.push(tint(new THREE.ConeGeometry(r, 3.4 - k * 0.3, 7).translate(0, 4.2 + k * 1.75, 0), k % 2 ? '#1c2a22' : '#17241d'));
  }
  const cedar = mergeGeometries(cedarParts);

  const spots = [];
  const target = quality === 'high' ? 420 : 220;
  for (let i = 0; spots.length < target && i < target * 30; i++) {
    const z = 12 - Math.pow(rand(), 0.8) * 80;
    const x = (rand() - 0.5) * 90;
    const clearing = 5.8 + Math.max(0, -z) * 0.13;
    if (Math.abs(x) < clearing) continue;
    const scale = 0.8 + rand() * 0.8;
    // Keep the moon unobstructed: reject trees whose crown would cross the camera → moon sight line.
    const t = (cam.z - z) / (cam.z - moonV.z);
    const lineX = cam.x + (moonV.x - cam.x) * t;
    const lineY = cam.y + (moonV.y - cam.y) * t;
    if (Math.abs(x - lineX) < 2.6 * scale + 1.5 && 12.5 * scale + heightAt(x, z) > lineY - 2) continue;
    spots.push([x, z, scale]);
  }
  const trees = new THREE.InstancedMesh(cedar, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  spots.forEach(([x, z, sc], i) => {
    m.compose(v.set(x, heightAt(x, z) - 0.2, z), q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.04, rand() * 6, (rand() - 0.5) * 0.04)), s.set(sc, sc * (0.9 + rand() * 0.3), sc));
    trees.setMatrixAt(i, m);
    trees.setColorAt(i, c.setScalar(0.75 + rand() * 0.5));
  });
  group.add(trees);

  // Maples: forked trunk + clustered foliage blobs.
  const trunks = [];
  const foliage = [];
  const leafColors = [palette.red, palette.wine, '#a3191c', palette.orange].map((h) => new THREE.Color(h));
  for (const [x, z] of MAPLES) {
    const y = heightAt(x, z);
    const lean = (rand() - 0.5) * 0.3;
    trunks.push(tint(new THREE.CylinderGeometry(0.09, 0.2, 3, 6).rotateZ(lean).translate(x, y + 1.5, z), '#1d1410'));
    for (const dir of [-1, 1]) {
      trunks.push(tint(new THREE.CylinderGeometry(0.05, 0.09, 1.8, 5).rotateZ(dir * 0.7 + lean).translate(x + dir * 0.55, y + 3, z), '#1d1410'));
    }
    for (let k = 0; k < 26; k++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 1.9;
      const blob = new THREE.IcosahedronGeometry(0.32 + rand() * 0.42, 1);
      blob.scale(1, 0.7, 1).translate(x + Math.cos(a) * r, y + 3.2 + rand() * 1.5 - r * 0.25, z + Math.sin(a) * r * 0.8);
      foliage.push(tint(blob, c.copy(leafColors[k % leafColors.length]).multiplyScalar(0.38 + rand() * 0.4)));
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  const maples = new THREE.Mesh(
    mergeGeometries(foliage),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, emissive: palette.wine, emissiveIntensity: 0.07 }),
  );
  group.add(maples);

  // Shrine hall on the terrace.
  const shrine = new THREE.Group();
  shrine.position.set(0, 3, -32);
  const wood = new THREE.MeshStandardMaterial({ color: '#1a1210', roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#0f1418', roughness: 0.7, flatShading: true });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 7.5), new THREE.MeshStandardMaterial({ color: palette.stone, roughness: 1 }));
  deck.position.y = 0.3;
  const hall = new THREE.Mesh(new THREE.BoxGeometry(9.5, 3.4, 5.5), wood);
  hall.position.y = 2.3;
  const roof = (w, d, h, y) => {
    const g = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d);
    const mesh = new THREE.Mesh(g, roofMat);
    mesh.position.y = y;
    return mesh;
  };
  const shoji = new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color(palette.sand).lerp(new THREE.Color(palette.orange), 0.35), emissiveIntensity: 0.45 });
  const windows = [];
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.0), shoji);
    w.position.set(i * 1.25, 2.1, 2.76);
    windows.push(w);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), new THREE.MeshStandardMaterial({ color: '#000', emissive: palette.orange, emissiveIntensity: 0.6 }));
  door.position.set(0, 1.75, 2.76);
  shrine.add(deck, hall, roof(9.2, 6.4, 2.6, 5.2), roof(6.4, 4.6, 2.2, 6.9), door, ...windows);
  group.add(shrine);

  // Ridges: layered jagged silhouettes, swallowed by fog into flat shapes against the sky.
  [[-130, 14, '#0c1b28'], [-160, 20, '#0a1722'], [-195, 27, '#08131c']].forEach(([z, h, col], k) => {
    const shape = new THREE.Shape();
    shape.moveTo(-320, -20);
    for (let x = -320; x <= 320; x += 16) {
      const y = h * (0.45 + 0.35 * Math.sin(x * 0.011 + k * 2) + 0.2 * Math.sin(x * 0.037 + k)) + (rand() - 0.5) * 4;
      shape.lineTo(x, y);
    }
    shape.lineTo(320, -20);
    const ridge = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col, fog: false }));
    ridge.position.z = z;
    group.add(ridge);
  });

  return { object: group, shrine, maples };
}
