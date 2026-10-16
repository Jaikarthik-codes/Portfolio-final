import * as THREE from 'three';
import { rng, leafTexture } from './util.js';

const EMBER_SOURCES = [[-2.9, 1.5, 2.0], [2.9, 1.5, 2.0], [-3.1, 1.5, -5.5], [3.1, 1.5, -5.5]];

/**
 * Falling maple leaves (instanced), embers rising from the lanterns, and low drifting ground fog.
 * API: { object, wind, gust (0..1 tweenable burst), setIntensity(v), update }
 */
export default function create({ palette, quality, reducedMotion }) {
  const group = new THREE.Group();
  group.name = 'atmosphere';
  const rand = rng(41);
  const high = quality === 'high';
  const api = { object: group, wind: 1, gust: 0, intensity: 1 };

  // --- Leaves ---------------------------------------------------------------------------------------
  const BOX = { x: [-10, 10], y: [0, 10], z: [-12, 14] };
  const span = (r) => r[0] + rand() * (r[1] - r[0]);
  const leafCount = high ? 260 : 120;
  const leaves = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.17, 0.17),
    new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, emissive: palette.red, emissiveIntensity: 0.12 }),
    leafCount,
  );
  leaves.frustumCulled = false;
  const reds = [palette.red, palette.red, palette.wine, palette.orange, '#e0352b'].map((h) => new THREE.Color(h));
  const state = Array.from({ length: leafCount }, (_, i) => {
    leaves.setColorAt(i, new THREE.Color().copy(reds[i % reds.length]).multiplyScalar(0.7 + rand() * 0.5));
    return {
      p: new THREE.Vector3(span(BOX.x), span(BOX.y), span(BOX.z)),
      r: new THREE.Euler(rand() * 6, rand() * 6, rand() * 6),
      spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(4),
      fall: 0.35 + rand() * 0.45,
      phase: rand() * 10,
      scale: 0.7 + rand() * 0.7,
    };
  });
  group.add(leaves);

  // --- Embers ---------------------------------------------------------------------------------------
  const emberCount = high ? 140 : 60;
  const emberPos = new Float32Array(emberCount * 3);
  const emberLife = new Float32Array(emberCount);
  const embers = Array.from({ length: emberCount }, (_, i) => ({ life: rand() * 3, max: 2 + rand() * 2.5, src: i % EMBER_SOURCES.length, drift: rand() * 10 }));
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  emberGeo.setAttribute('life', new THREE.BufferAttribute(emberLife, 1));
  const emberPoints = new THREE.Points(
    emberGeo,
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(palette.ember).multiplyScalar(3) }, uScale: { value: 70 * Math.min(devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float life;
        uniform float uScale;
        varying float vLife;
        void main() {
          vLife = life;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uScale * 0.05 * (1.0 - life * 0.6) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * smoothstep(0.0, 0.15, vLife) * (1.0 - vLife);
          gl_FragColor = vec4(uColor * a, a);
        }`,
    }),
  );
  emberPoints.frustumCulled = false;
  group.add(emberPoints);

  // --- Ground fog -----------------------------------------------------------------------------------
  const fogUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color('#3a5670') }, uOpacity: { value: 1 } };
  const fogMat = new THREE.ShaderMaterial({
    uniforms: fogUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
      void main() {
        vec2 p = vWorld.xz * 0.12 + vec2(uTime * 0.03, uTime * 0.012);
        float n = fbm(p + fbm(p * 1.7 - uTime * 0.02));
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        float near = smoothstep(2.0, 7.0, distance(cameraPosition, vWorld)); // never fog the lens
        float a = smoothstep(0.35, 0.85, n) * edge * near * 0.22 * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
  [0.25, 0.6, 1.0, 1.4].forEach((y, i) => {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(44, 46).rotateX(-Math.PI / 2), fogMat);
    sheet.position.set(0, y, -9 + i * 0.7);
    sheet.renderOrder = 2;
    group.add(sheet);
  });

  // --- Update ---------------------------------------------------------------------------------------
  const dummy = new THREE.Object3D();
  api.setIntensity = (v) => {
    api.intensity = v;
    fogUniforms.uOpacity.value = v;
  };
  api.update = (time, delta) => {
    const dt = reducedMotion ? delta * 0.3 : delta;
    const gust = api.gust;
    const windX = (0.35 + gust * 2.2) * api.wind;
    state.forEach((l, i) => {
      l.p.y -= l.fall * (1 + gust * 0.6) * dt;
      l.p.x += (windX + Math.sin(time * 0.9 + l.phase) * 0.35) * dt;
      l.p.z += (Math.cos(time * 0.7 + l.phase) * 0.25 + gust * 0.8) * dt;
      l.r.x += l.spin.x * dt * (1 + gust);
      l.r.y += l.spin.y * dt;
      l.r.z += l.spin.z * dt * (1 + gust);
      if (l.p.y < 0.02 || l.p.x > BOX.x[1] || l.p.z > BOX.z[1]) {
        l.p.set(span(BOX.x) - windX * 3, BOX.y[1] * (0.6 + rand() * 0.4), span(BOX.z));
      }
      dummy.position.copy(l.p);
      dummy.rotation.copy(l.r);
      dummy.scale.setScalar(l.scale);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    });
    leaves.instanceMatrix.needsUpdate = true;

    embers.forEach((e, i) => {
      e.life += dt / e.max;
      if (e.life >= 1) {
        e.life = 0;
        e.src = Math.floor(rand() * EMBER_SOURCES.length);
        e.drift = rand() * 10;
      }
      const [sx, sy, sz] = EMBER_SOURCES[e.src];
      const t = e.life * e.max;
      emberPos[i * 3] = sx + Math.sin(t * 2 + e.drift) * 0.15 * t + windX * 0.25 * t;
      emberPos[i * 3 + 1] = sy + t * 0.55;
      emberPos[i * 3 + 2] = sz + Math.cos(t * 1.7 + e.drift) * 0.12 * t;
      emberLife[i] = e.life;
    });
    emberGeo.attributes.position.needsUpdate = true;
    emberGeo.attributes.life.needsUpdate = true;

    fogUniforms.uTime.value = time;
  };
  return api;
}
