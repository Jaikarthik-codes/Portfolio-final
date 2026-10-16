import * as THREE from 'three';

/**
 * The blood moon: a camera-facing disc with procedural maria, limb darkening and a shadowed edge,
 * plus an additive halo. Bright enough (> 1) to bloom.
 * API: { object, mesh (god-rays light source), update, setBlood(t) } — blood 0 = pale, 1 = blood red.
 */
export default function create({ palette, camera }, { position = [14, 26, -95], radius = 9 } = {}) {
  const group = new THREE.Group();
  group.name = 'moon';
  group.position.set(...position);

  const uniforms = {
    uBlood: { value: 1 },
    uPale: { value: new THREE.Color(palette.sand) },
    uRed: { value: new THREE.Color(palette.red) },
    uWine: { value: new THREE.Color(palette.wine) },
    uIntensity: { value: 2.1 },
  };

  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uPale, uRed, uWine;
        uniform float uBlood, uIntensity;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          vec3 n = vec3(p, sqrt(1.0 - r * r));
          vec2 q = n.xy / (1.0 + n.z * 0.6); // wrap features toward the limb
          float maria = smoothstep(0.48, 0.72, fbm(q * 2.2 + 4.0));
          float grain = fbm(q * 9.0);
          vec3 lit = mix(uPale, mix(uRed, vec3(1.0, 0.45, 0.3), 0.14), uBlood);
          vec3 dark = mix(uPale * 0.55, uWine, uBlood);
          vec3 col = mix(lit, dark, maria * 0.7) * (0.82 + grain * 0.36);
          col *= mix(0.45, 1.0, smoothstep(-0.5, 0.9, dot(n, normalize(vec3(-0.35, 0.45, 0.82)))));
          col *= pow(n.z, 0.3);
          gl_FragColor = vec4(col * uIntensity, smoothstep(1.0, 0.98, r));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  disc.renderOrder = -1;

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 7, radius * 7),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uPale, uRed;
        uniform float uBlood;
        varying vec2 vUv;
        void main() {
          float r = length(vUv * 2.0 - 1.0) * 3.5; // 1.0 = moon edge
          float g = exp(-max(r - 1.0, 0.0) * 3.2) * 0.4 + exp(-max(r - 1.0, 0.0) * 1.5) * 0.035;
          gl_FragColor = vec4(mix(uPale * 0.6, uRed, uBlood) * g * step(0.98, r), 1.0);
        }`,
    }),
  );
  halo.renderOrder = -1;
  group.add(halo, disc);

  return {
    object: group,
    mesh: disc,
    update() {
      group.quaternion.copy(camera.getWorldQuaternion(group.quaternion));
    },
    setBlood(t) {
      uniforms.uBlood.value = t;
    },
  };
}
