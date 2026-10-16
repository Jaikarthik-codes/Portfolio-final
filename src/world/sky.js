import * as THREE from 'three';

/**
 * Night sky dome (ink zenith → navy horizon, blood glow around the moon) + twinkling stars.
 * API: { object, update, setBlood(t) } — blood 0 = pale intro sky, 1 = blood-moon night.
 */
export default function create({ palette, quality }, { moon = [14, 26, -95] } = {}) {
  const group = new THREE.Group();
  group.name = 'sky';
  const moonDir = new THREE.Vector3(...moon).normalize();

  const uniforms = {
    uTop: { value: new THREE.Color(palette.ink) },
    uHorizon: { value: new THREE.Color(palette.navy).lerp(new THREE.Color(palette.night), 0.35) },
    uGlow: { value: new THREE.Color(palette.red) },
    uPale: { value: new THREE.Color(palette.sand) },
    uMoonDir: { value: moonDir },
    uBlood: { value: 1 },
    uTime: { value: 0 },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uGlow, uPale, uMoonDir;
        uniform float uBlood;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(uHorizon, uTop, smoothstep(-0.05, 0.6, d.y));
          float m = max(dot(d, uMoonDir), 0.0);
          vec3 glow = mix(uPale * 0.35, uGlow, uBlood);
          col += glow * (pow(m, 40.0) * 0.35 + pow(m, 8.0) * 0.1 + pow(m, 2.5) * 0.02);
          col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither away banding
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -2;
  group.add(dome);

  // Stars on the upper hemisphere, thinned toward the horizon and inside the moon glow.
  const count = quality === 'high' ? 2200 : 1100;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0, n = 0; n < count && i < count * 20; i++) {
    v.set(Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1).normalize();
    if (v.y < 0.04 || Math.random() > v.y * 1.6 || v.dot(moonDir) > 0.97) continue;
    v.multiplyScalar(420).toArray(positions, n * 3);
    seeds[n++] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const stars = new THREE.Points(
    starGeo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uPixelRatio: { value: Math.min(devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uPixelRatio;
        varying float vAlpha;
        void main() {
          vAlpha = (0.25 + 0.75 * seed * seed) * (0.6 + 0.4 * sin(uTime * (0.6 + seed * 2.2) + seed * 40.0));
          gl_PointSize = (0.8 + seed * seed * 2.2) * uPixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.92, 0.9, 0.85), vAlpha * smoothstep(0.5, 0.0, d));
        }`,
    }),
  );
  stars.renderOrder = -1;
  group.add(stars);

  return {
    object: group,
    update(time) {
      uniforms.uTime.value = time;
    },
    setBlood(t) {
      uniforms.uBlood.value = t;
    },
  };
}
