import * as THREE from 'three';
import { mergeGeometries, weather, rng } from './util.js';

const SPOTS = [
  [-2.9, 0, 2.0], [2.9, 0, 2.0],
  [-3.1, 0, -5.5], [3.1, 0, -5.5],
  [-2.4, 3, -21], [2.4, 3, -21],
];

/**
 * Hexagonal Kasuga-style stone lanterns (tōrō) with flickering firelight.
 * Each lantern's `lit` (0..1) drives its paper glow, flame and point light — tween it for the ignition.
 * API: { object, lanterns: [{ group, light, lit, position }], setLit(i, v), setAllLit(v), flicker, update }
 */
export default function create({ palette, quality, reducedMotion }, { spots = SPOTS, lit = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'lanterns';
  const rand = rng(11);
  const hex = (rTop, rBottom, h, y) => new THREE.CylinderGeometry(rTop, rBottom, h, 6).translate(0, y + h / 2, 0);

  const parts = () => [
    hex(0.4, 0.48, 0.2, 0), // kiso
    hex(0.13, 0.15, 0.78, 0.2), // sao
    hex(0.18, 0.18, 0.06, 0.55), // fushi ring
    hex(0.36, 0.22, 0.18, 0.98), // chūdai
    ...[0, 1, 2, 3, 4, 5].map((k) => {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      return new THREE.BoxGeometry(0.07, 0.42, 0.07).translate(Math.cos(a) * 0.25, 1.37, Math.sin(a) * 0.25);
    }),
    hex(0.6, 0.62, 0.06, 1.58), // roof rim
    new THREE.ConeGeometry(0.58, 0.34, 6).translate(0, 1.81, 0), // kasa
    hex(0.07, 0.1, 0.08, 1.96),
    new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1.25, 1).translate(0, 2.1, 0), // hōju
  ];

  const stone = [];
  const lanterns = spots.map((p, i) => {
    const tiltX = (rand() - 0.5) * 0.05;
    const tiltZ = (rand() - 0.5) * 0.05;
    const yaw = rand() * Math.PI;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...p),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ)),
      new THREE.Vector3(1, 0.94 + rand() * 0.12, 1),
    );
    stone.push(...parts().map((g) => g.applyMatrix4(m)));

    const lantern = { group: new THREE.Group(), lit, position: new THREE.Vector3(...p), seed: rand() * 100 };
    lantern.group.position.set(...p);
    lantern.group.rotation.set(tiltX, yaw, tiltZ);

    lantern.paper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.235, 0.235, 0.38, 6, 1, true).translate(0, 1.37, 0),
      new THREE.MeshStandardMaterial({ color: '#2a1a10', emissive: palette.orange, emissiveIntensity: 0, roughness: 1, side: THREE.DoubleSide }),
    );
    lantern.flame = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: palette.ember, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    lantern.flame.position.y = 1.37;
    lantern.flame.scale.setScalar(0.9);
    lantern.group.add(lantern.paper, lantern.flame);

    // Point lights only where they matter: all six on high, the two by the camera on low.
    if (quality === 'high' || i < 2) {
      lantern.light = new THREE.PointLight(palette.orange, 0, 9, 2);
      lantern.light.position.y = 1.4;
      lantern.group.add(lantern.light);
    }
    group.add(lantern.group);
    return lantern;
  });

  group.add(
    new THREE.Mesh(
      weather(mergeGeometries(stone), {
        base: new THREE.Color(palette.stone).multiplyScalar(0.9),
        grime: palette.earth,
        moss: palette.moss,
        grimeHeight: 1.2,
        mossAmount: 0.6,
        jitter: 0.2,
      }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
    ),
  );

  const api = {
    object: group,
    lanterns,
    flicker: reducedMotion ? 0.04 : 0.16,
    setLit(i, v) {
      lanterns[i].lit = v;
    },
    setAllLit(v) {
      lanterns.forEach((l) => (l.lit = v));
    },
    update(time) {
      for (const l of lanterns) {
        const t = time * 1.0 + l.seed;
        // Layered sines read as a candle; random jitter reads as a broken bulb.
        const f = 1 + api.flicker * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.3) * 0.3 + Math.sin(t * 2.1) * 0.6) / 1.4;
        const v = l.lit * f;
        l.paper.material.emissiveIntensity = v * 2.6;
        l.flame.material.opacity = Math.min(l.lit, 1) * (0.75 + 0.25 * f);
        l.flame.scale.setScalar(0.75 + 0.2 * f);
        if (l.light) l.light.intensity = v * 9;
      }
    },
  };
  api.update(0);
  return api;
}

let glow;
function glowTexture() {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,220,170,0.6)');
  grd.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
}
