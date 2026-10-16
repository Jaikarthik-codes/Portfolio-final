import * as THREE from 'three';
import { mergeGeometries, weather, tint, rng } from './util.js';

/**
 * Myōjin torii at the origin: upturned kasagi with a black cap, shimaki, nuki with wedges, gakuzuka + 天与 plaque,
 * leaning pillars with black sleeves on stone footings. Weathered lacquer, moss, hanging vines, and a shimenawa rope
 * with swaying shide streamers.
 * API: { object, plaque, shide: Mesh[], update }
 */
export default function create({ palette, reducedMotion }) {
  const group = new THREE.Group();
  group.name = 'torii';
  const rand = rng(7);
  const lacquerColor = new THREE.Color(palette.wine).lerp(new THREE.Color(palette.red), 0.5);

  // Box bent upward toward its ends (sori).
  const beam = (w, h, d, y, lift, z = 0) => {
    const g = new THREE.BoxGeometry(w, h, d, 40, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.abs(p.getX(i)) / (w / 2);
      p.setY(i, p.getY(i) + lift * Math.pow(t, 2.4));
    }
    g.translate(0, y, z);
    g.computeVertexNormals();
    return g;
  };

  const lacquer = [];
  const black = [];
  const stone = [];

  for (const side of [-1, 1]) {
    const pillar = new THREE.CylinderGeometry(0.2, 0.25, 4.95, 18, 6);
    pillar.translate(0, 4.95 / 2, 0);
    pillar.rotateZ(side * -0.022); // uchikorobi: pillars lean inward
    pillar.translate(side * 2.0, 0, 0);
    lacquer.push(pillar);

    const sleeve = new THREE.CylinderGeometry(0.27, 0.28, 0.6, 18);
    sleeve.translate(side * 2.0, 0.3, 0);
    black.push(sleeve);
    const footing = new THREE.CylinderGeometry(0.38, 0.44, 0.22, 10);
    footing.translate(side * 2.0, 0.08, 0);
    stone.push(footing);

    const wedge = new THREE.BoxGeometry(0.1, 0.3, 0.12);
    wedge.translate(side * 1.88, 4.0, 0.18);
    black.push(wedge);
  }

  const nuki = new THREE.BoxGeometry(5.7, 0.34, 0.24);
  nuki.translate(0, 4.0, 0);
  const gakuzuka = new THREE.BoxGeometry(0.22, 0.75, 0.2);
  gakuzuka.translate(0, 4.55, 0);
  lacquer.push(nuki, gakuzuka, beam(6.1, 0.3, 0.36, 4.98, 0.12), beam(6.9, 0.34, 0.44, 5.3, 0.42));
  black.push(beam(7.0, 0.1, 0.5, 5.5, 0.42));

  const lacquerGeo = weather(mergeGeometries(lacquer), {
    base: lacquerColor,
    grime: new THREE.Color(palette.wine).multiplyScalar(0.25),
    moss: palette.moss,
    grimeHeight: 3.2,
    mossAmount: 0.5,
  });
  group.add(
    new THREE.Mesh(lacquerGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 })),
    new THREE.Mesh(mergeGeometries(black), new THREE.MeshStandardMaterial({ color: '#0d0b0b', roughness: 0.55 })),
    new THREE.Mesh(
      weather(mergeGeometries(stone), { base: palette.stone, grime: palette.earth, moss: palette.moss, grimeHeight: 0.4 }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
    ),
  );

  // Plaque with 天与 ("heaven-given") in gold on black.
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0b0909';
  g.fillRect(0, 0, 128, 192);
  g.strokeStyle = '#b8964f';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 112, 176);
  g.fillStyle = '#e9cf8f';
  g.font = '500 64px "Shippori Mincho", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('天', 64, 64);
  g.fillText('与', 64, 132);
  const plaqueTex = new THREE.CanvasTexture(canvas);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.78, 0.07),
    [
      ...Array(4).fill(new THREE.MeshStandardMaterial({ color: '#0b0909', roughness: 0.6 })),
      new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.5, emissive: '#e9cf8f', emissiveMap: plaqueTex, emissiveIntensity: 0.25 }),
      new THREE.MeshStandardMaterial({ color: '#0b0909' }),
    ],
  );
  plaque.position.set(0, 4.56, 0.15);
  group.add(plaque);
  // Re-draw once the Japanese font is ready (first paint may use a fallback face).
  document.fonts?.load('500 64px "Shippori Mincho"', '天与').then(() => {
    g.fillStyle = '#0b0909';
    g.fillRect(14, 14, 100, 164);
    g.fillStyle = '#e9cf8f';
    g.fillText('天', 64, 64);
    g.fillText('与', 64, 132);
    plaqueTex.needsUpdate = true;
  });

  // Vines draped over the beams + shimenawa rope under the nuki, merged into one vertex-coloured mesh.
  const organic = [];
  const sag = (a, b, depth) => new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -depth, 0.05)), b);
  for (let i = 0; i < 7; i++) {
    const x = (rand() - 0.5) * 6;
    const onTop = rand() > 0.4;
    const y0 = onTop ? 5.3 + 0.42 * Math.pow(Math.abs(x) / 3.45, 2.4) : 4.0;
    const len = 0.3 + rand() * (onTop ? 0.9 : 0.6);
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(new THREE.Vector3(x + Math.sin(t * 5 + i) * 0.08, y0 - t * len, 0.2 + Math.sin(t * 3 + i) * 0.05));
    }
    organic.push(tint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.018 + rand() * 0.012, 4), palette.moss));
  }
  organic.push(
    tint(new THREE.TubeGeometry(sag(new THREE.Vector3(-1.9, 3.72, 0.16), new THREE.Vector3(1.9, 3.72, 0.16), 0.3), 32, 0.07, 6), '#6d5c3c'),
  );
  group.add(new THREE.Mesh(mergeGeometries(organic), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));

  // Shide: zigzag paper streamers hanging from the rope.
  const shape = new THREE.Shape();
  shape.moveTo(-0.06, 0).lineTo(0.06, 0).lineTo(0.06, -0.12).lineTo(-0.02, -0.12).lineTo(-0.02, -0.24)
    .lineTo(0.08, -0.24).lineTo(0.08, -0.36).lineTo(0, -0.36).lineTo(0, -0.5).lineTo(-0.08, -0.5)
    .lineTo(-0.08, -0.36).lineTo(-0.02, -0.36).lineTo(-0.02, -0.24).lineTo(-0.12, -0.24).lineTo(-0.12, -0.12)
    .lineTo(-0.06, -0.12).closePath();
  const shideGeo = new THREE.ShapeGeometry(shape);
  const shideMat = new THREE.MeshStandardMaterial({ color: palette.sand, roughness: 0.8, side: THREE.DoubleSide, emissive: palette.sand, emissiveIntensity: 0.06 });
  const shide = [-1.1, -0.38, 0.38, 1.1].map((x) => {
    const m = new THREE.Mesh(shideGeo, shideMat);
    m.position.set(x, 3.58 - 0.3 * (1 - (x / 1.9) ** 2) + 0.03, 0.2);
    group.add(m);
    return m;
  });

  return {
    object: group,
    plaque,
    shide,
    update(time) {
      if (reducedMotion) return;
      shide.forEach((m, i) => {
        m.rotation.x = Math.sin(time * 1.3 + i * 1.7) * 0.18;
        m.rotation.z = Math.sin(time * 0.9 + i) * 0.06;
      });
    },
  };
}
