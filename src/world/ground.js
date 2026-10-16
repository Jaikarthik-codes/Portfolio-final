import * as THREE from 'three';
import { mergeGeometries, weather, wobble, rng, leafTexture } from './util.js';

/** Ground height: flat in front of the gate, a slope under the steps, the shrine terrace at y = 3 behind. */
export function heightAt(x, z) {
  const terrace = THREE.MathUtils.clamp((-10 - z) / 10, 0, 1) * 3;
  const off = THREE.MathUtils.smoothstep(Math.abs(x), 1.6, 7);
  return terrace + (wobble(x * 0.35, 0, z * 0.35) - 0.5) * 0.5 * off - (Math.abs(x) < 1.7 ? 0.03 : 0);
}

/**
 * Terrain, flagstone path, steps up to the terrace, mossy rocks, wind-swayed grass (one draw call)
 * and fallen maple leaves.
 * API: { object, grass, setWind(v), update, heightAt }
 */
export default function create({ palette, quality, reducedMotion }) {
  const group = new THREE.Group();
  group.name = 'ground';
  const rand = rng(23);
  const high = quality === 'high';

  // Terrain
  const terrain = new THREE.PlaneGeometry(140, 170, 140, 170).rotateX(-Math.PI / 2).translate(0, 0, -25);
  const tp = terrain.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, heightAt(tp.getX(i), tp.getZ(i)));
  terrain.computeVertexNormals();
  const tc = new Float32Array(tp.count * 3);
  const earth = new THREE.Color(palette.earth);
  const moss = new THREE.Color(palette.moss);
  const c = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const n = wobble(tp.getX(i) * 0.6, 1, tp.getZ(i) * 0.6);
    c.copy(earth).lerp(moss, THREE.MathUtils.smoothstep(n, 0.35, 0.8) * 0.8).toArray(tc, i * 3);
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  group.add(new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));

  // Flagstones: front path and terrace path.
  const stones = [];
  for (const [z0, z1, y] of [[16, -10, 0], [-20.5, -30, 3]]) {
    for (let z = z0; z > z1; z -= 0.62) {
      for (let x = -1.05; x <= 1.06; x += 0.7) {
        if (rand() < 0.06) continue;
        stones.push([x + (rand() - 0.5) * 0.22, y, z + (rand() - 0.5) * 0.2, 0.42 + rand() * 0.34, 0.38 + rand() * 0.3, rand() * Math.PI]);
      }
    }
  }
  const slab = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true });
  const path = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0).scale(1, 0.14, 1), slab, stones.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const stoneColor = new THREE.Color(palette.stone);
  stones.forEach(([x, y, z, sx, sz, r], i) => {
    m.compose(v.set(x, y + 0.02, z), q.setFromEuler(new THREE.Euler(0, r, 0)), s.set(sx, 1, sz));
    path.setMatrixAt(i, m);
    path.setColorAt(i, c.copy(stoneColor).multiplyScalar(0.28 + rand() * 0.28).lerp(moss, rand() * 0.35));
  });
  group.add(path);

  // Steps: ten solid blocks z −10 → −20 rising to y = 3, plus side walls.
  const blocks = [];
  for (let i = 0; i < 10; i++) {
    const top = 0.3 * (i + 1);
    blocks.push(new THREE.BoxGeometry(3.2, top, 1.02).translate(0, top / 2, -10.5 - i));
  }
  for (const side of [-1, 1]) {
    const wall = new THREE.BoxGeometry(0.5, 3.4, 10.4);
    const wp = wall.attributes.position;
    for (let i = 0; i < wp.count; i++) {
      const z = wp.getZ(i);
      if (wp.getY(i) > 0) wp.setY(i, 0.35 + ((0.5 - z / 10.4) * 3)); // slope the wall top with the steps
    }
    wall.translate(side * 1.85, 0, -15);
    wall.computeVertexNormals();
    blocks.push(wall);
  }
  group.add(
    new THREE.Mesh(
      weather(mergeGeometries(blocks), { base: new THREE.Color(palette.stone).multiplyScalar(0.7), grime: palette.earth, moss: palette.moss, grimeHeight: 3, mossAmount: 0.55 }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
    ),
  );

  // Mossy rocks along the path edges and the foreground.
  const rockSpots = [];
  for (let i = 0; i < 46; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const z = 14 - rand() * 30;
    const x = side * (1.6 + rand() * (z > 6 ? 9 : 5));
    rockSpots.push([x, z, 0.15 + rand() * 0.5]);
  }
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    rockSpots.length,
  );
  rockSpots.forEach(([x, z, r], i) => {
    m.compose(v.set(x, heightAt(x, z) + r * 0.25, z), q.setFromEuler(new THREE.Euler(rand(), rand() * 6, rand())), s.set(r * 1.3, r * 0.75, r));
    rocks.setMatrixAt(i, m);
    rocks.setColorAt(i, c.copy(stoneColor).multiplyScalar(0.4 + rand() * 0.3).lerp(moss, 0.3 + rand() * 0.4));
  });
  group.add(rocks);

  // Grass: tapered blades, bent by wind in the vertex shader.
  const blade = new THREE.BufferGeometry();
  const bw = 0.045;
  blade.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-bw, 0, 0, bw, 0, 0, -bw * 0.6, 0.45, 0, bw * 0.6, 0.45, 0, 0, 1, 0]), 3));
  blade.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1, 1, 1]), 3));
  blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  blade.computeVertexNormals();

  const blades = [];
  const total = high ? 60000 : 24000;
  for (let i = 0; i < total; i++) {
    const fg = i < total * 0.55; // dense foreground band in front of the letters
    const x = fg ? (rand() > 0.5 ? 1 : -1) * (1.5 + Math.pow(rand(), 1.4) * 13) : (rand() - 0.5) * 44;
    const z = fg ? 7 + rand() * 7.5 : 14 - rand() * 34;
    if (Math.abs(x) < 1.45 && z > -10) continue;
    if (Math.abs(x) < 2.2 && z < -10 && z > -20) continue; // steps
    if (!fg && wobble(x * 0.5, 2, z * 0.5) < 0.42) continue; // patchy
    const h = fg ? 0.45 + rand() * 0.75 : 0.2 + rand() * 0.45;
    blades.push([x, heightAt(x, z), z, h, rand() * Math.PI]);
  }
  const uWind = { value: 1 };
  const uTime = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = uWind;
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind, uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = instanceMatrix[3].xyz;
        float sway = sin(uTime * 1.6 + root.x * 0.6 + root.z * 0.4) * 0.6 + sin(uTime * 3.1 + root.x * 1.7) * 0.25;
        transformed.x += sway * uWind * 0.18 * position.y * position.y;
        transformed.z += cos(uTime * 1.2 + root.z * 0.5) * uWind * 0.06 * position.y * position.y;`,
      );
  };
  const grass = new THREE.InstancedMesh(blade, grassMat, blades.length);
  const grassLow = new THREE.Color(palette.moss).multiplyScalar(0.8);
  const grassTip = new THREE.Color('#5d6b3c');
  const rim = new THREE.Color(palette.wine);
  blades.forEach(([x, y, z, h, r], i) => {
    m.compose(v.set(x, y, z), q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, r, (rand() - 0.5) * 0.4)), s.set(1, h, 1));
    grass.setMatrixAt(i, m);
    grass.setColorAt(i, c.copy(grassLow).lerp(grassTip, rand() * 0.7).lerp(rim, rand() * 0.15));
  });
  grass.frustumCulled = false;
  group.add(grass);

  // Fallen maple leaves on the ground and path.
  const fallen = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.14, 0.14).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }),
    high ? 700 : 300,
  );
  const reds = [palette.red, palette.wine, palette.orange, '#9e1b1b'].map((h) => new THREE.Color(h));
  for (let i = 0; i < fallen.count; i++) {
    const x = (rand() - 0.5) * (rand() > 0.6 ? 3 : 16);
    const z = 13 - rand() * 22;
    m.compose(v.set(x, heightAt(x, z) + 0.035 + rand() * 0.01, z), q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, rand() * 6, (rand() - 0.5) * 0.3)), s.setScalar(0.7 + rand() * 0.8));
    fallen.setMatrixAt(i, m);
    fallen.setColorAt(i, c.copy(reds[i % reds.length]).multiplyScalar(0.55 + rand() * 0.4));
  }
  group.add(fallen);

  return {
    object: group,
    grass,
    heightAt,
    setWind(w) {
      uWind.value = w;
    },
    update(time) {
      uTime.value = reducedMotion ? 0 : time;
    },
  };
}
