/**
 * Toji Fushiguro — a camera-facing (Y-axis cylindrical) billboard walking down the path,
 * graded into the night with a blood-red alpha-edge rim from the moon behind him, a warm
 * lantern side-light that swells as he passes each lantern pair, and a soft ground shadow
 * (contact blob + a faint long moon shadow stretching toward the camera).
 *
 * Art: tries `${BASE_URL}assets/toji.png` (public/assets/toji.png); if missing, paints a
 * procedural silhouette placeholder on a canvas.
 *
 * create(ctx, opts) — async. opts (all optional):
 *   src            art url ('assets/toji.png' under BASE_URL); null skips loading and uses the placeholder
 *   key            'alpha' | 'green' | 'white' keying for src ('alpha')
 *   walk           initial walk 0..1 (0)
 *   from, to       path z for walk 0 and 1 (−7, 6.5)
 *   x              path x (0)
 *   height         figure height in metres (1.9)
 *   feet, head     art fractions (from the bottom) where the soles / top of the head sit (0.02, 0.97)
 *   stride         metres per step for the bob/sway (0.78)
 *   rim, rimWidth  rim strength (3.2) and width in metres (0.016)
 *   warm           lantern side-light strength (1.2); lanterns: z list of lantern pairs ([2, −5.5])
 *   shadow         ground shadow opacity (0.75); longShadow 0..1 (0.4); shadowLength metres (3.2)
 *
 * Returns {
 *   object,                    group at the feet: billboard + ground shadow
 *   walk,                      0..1 along the path; tween it — update() applies position + stride bob/sway
 *   setTexture(url, { key, feet, head }) => Promise<boolean>   swap art (data URLs work)
 *   uniforms,                  billboard uniforms (uExposure, uSaturation, uRimColor, uRimStrength, uWarm, uOpacity …)
 *   shadowUniforms,
 *   update(time, delta), dispose()
 * }
 */

const KEYS = { alpha: 0, green: 1, white: 2 };

// Shared GLSL: keying + edge sampling, used by the billboard and its shadow.
const keyChunk = /* glsl */ `
  uniform sampler2D map;
  uniform int uKey;
  uniform vec3 uKeyParams; // threshold, softness, despill
  float keyAlpha(vec4 t) {
    vec3 c = pow(max(t.rgb, 0.0), vec3(1.0 / 2.2)); // key in display space
    if (uKey == 1) {
      float g = c.g - max(c.r, c.b);
      return t.a * (1.0 - smoothstep(uKeyParams.x, uKeyParams.x + uKeyParams.y, g));
    }
    if (uKey == 2) {
      float w = min(min(c.r, c.g), c.b);
      float chroma = max(max(c.r, c.g), c.b) - w;
      return t.a * (1.0 - smoothstep(1.0 - uKeyParams.x - uKeyParams.y, 1.0 - uKeyParams.x, w - chroma));
    }
    return t.a;
  }
  float alphaAt(vec2 uv) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return keyAlpha(texture2D(map, uv));
  }
  float alphaAtBias(vec2 uv, float bias) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return keyAlpha(texture2D(map, uv, bias));
  }
`;

// Billboard basis: feet at the object origin, facing the camera around world Y.
const billboardChunk = /* glsl */ `
  uniform vec2 uSize;  // plane width / height in metres
  uniform float uFeet; // uv.y of the soles
  vec3 bbBase() { return (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; }
  vec3 bbRight(vec3 base) {
    vec3 toCam = cameraPosition - base;
    toCam.y = 0.0;
    vec3 f = dot(toCam, toCam) > 1e-6 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
    return vec3(f.z, 0.0, -f.x);
  }
`;

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  ${billboardChunk}
  uniform float uSway;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 base = bbBase();
    vec3 right = bbRight(base);
    float s = length(modelMatrix[1].xyz);
    vec2 p = vec2(position.x * uSize.x, (position.y - uFeet) * uSize.y) * s;
    // Stride sway: roll about the feet.
    float c = cos(uSway), n = sin(uSway);
    p = vec2(c * p.x - n * p.y, n * p.x + c * p.y);
    vec4 mvPosition = viewMatrix * vec4(base + right * p.x + vec3(0.0, p.y, 0.0), 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  ${keyChunk}
  uniform vec2 uRimUv;      // rim width in uv
  uniform vec2 uRimDir;     // screen-ish direction toward the moon, in uv
  uniform vec3 uRimColor;
  uniform float uRimStrength;
  uniform vec3 uWarmColor;
  uniform float uWarm;      // lantern side light (driven by distance to lanterns)
  uniform float uUnder;     // warm under-light from the ground
  uniform float uExposure;
  uniform float uSaturation;
  uniform vec3 uShadowTint;
  uniform float uShadowTintAmount;
  uniform float uGlint;
  uniform float uOpacity;
  uniform float uFeet;
  varying vec2 vUv;

  void main() {
    vec4 tex = texture2D(map, vUv);
    float a = keyAlpha(tex);
    if (a < 0.004) discard;

    // Un-mix the key colour from soft edges.
    vec3 col = tex.rgb;
    if (uKey == 1) {
      col.g = mix(col.g, min(col.g, max(col.r, col.b)), uKeyParams.z);
    } else if (uKey == 2) {
      col = clamp((col - (1.0 - a)) / max(a, 0.05), 0.0, 1.0);
    }
    float rawLuma = dot(pow(col, vec3(1.0 / 2.2)), vec3(0.2126, 0.7152, 0.0722));

    // Grade into the scene: exposure, desaturate, navy into the shadows.
    col *= uExposure;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, uSaturation);
    float shadow = 1.0 - smoothstep(0.0, 0.25, l);
    col = mix(col, col * 0.6 + uShadowTint, shadow * uShadowTintAmount);

    // Alpha-edge rim: how much of the neighbourhood is empty, weighted toward the moon.
    vec2 w = max(uRimUv, fwidth(vUv) * 1.25);
    float omni = 0.0, toward = 0.0, sides = 0.0, below = 0.0;
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.7853982 + 0.3926991;
      vec2 d = vec2(cos(ang), sin(ang));
      float miss = 1.0 - (alphaAt(vUv + d * w) * 0.6 + alphaAt(vUv + d * w * 2.4) * 0.4);
      omni += miss;
      toward += miss * max(dot(d, uRimDir), 0.0);
      sides += miss * abs(d.x);
      below += miss * max(-d.y, 0.0);
    }
    omni /= 8.0;
    toward /= 2.6;
    sides /= 5.2;
    below /= 2.6;
    float rim = clamp(omni * 0.55 + toward * 1.1, 0.0, 1.0);
    rim = rim * rim * (3.0 - 2.0 * rim);

    float height01 = clamp((vUv.y - uFeet) / (1.0 - uFeet), 0.0, 1.0);
    vec3 light = uRimColor * uRimStrength * rim;
    // Lanterns sit at ~1.5 m either side: warm side edges, strongest mid-body.
    light += uWarmColor * uWarm * clamp(sides, 0.0, 1.0) * smoothstep(0.05, 0.45, height01) * (1.0 - smoothstep(0.75, 1.0, height01));
    // Ground bounce from the lantern pools.
    light += uWarmColor * uUnder * (1.0 - smoothstep(0.0, 0.35, height01)) * (0.35 + below);
    col += light;
    // Polished steel: let the brightest strokes of the art bloom.
    col += vec3(0.85, 0.9, 1.0) * smoothstep(0.62, 0.92, rawLuma) * uGlint;

    gl_FragColor = vec4(col, a * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const shadowVertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  ${billboardChunk}
  uniform vec2 uShadowDir; // ground offset per metre of height (moon behind -> toward camera)
  uniform float uShadowLength;
  uniform float uPad;
  varying vec2 vUv;
  varying vec2 vGround; // metres from the feet: x across, y along the shadow
  void main() {
    vUv = uv;
    vec3 base = bbBase();
    vec3 right = bbRight(base);
    // Quad spans the billboard width and its height laid along the shadow, padded behind the feet.
    float along = mix(-uPad, 1.0, position.y);
    float across = position.x * (uSize.x + uPad * 2.0);
    vGround = vec2(across, along * uSize.y);
    vec2 dir = uShadowDir * uShadowLength;
    vec3 world = base + right * across + vec3(dir.x, 0.0, dir.y) * (along * uSize.y);
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const shadowFragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  ${keyChunk}
  uniform vec2 uSize;
  uniform float uFeet;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uLong;
  varying vec2 vUv;
  varying vec2 vGround;
  void main() {
    // Contact blob: tight dark ellipse at the soles.
    vec2 e = vGround / vec2(0.36, 0.22);
    float blob = 1.0 - smoothstep(0.15, 1.0, length(e));
    // Long shadow: the silhouette itself, blurred via mip bias, fading with distance.
    float t = vGround.y / uSize.y; // 0 at the feet .. 1 at the head
    vec2 suv = vec2(vUv.x * (1.0 + 0.0) , uFeet + t * (1.0 - uFeet));
    float sx = 0.5 + vGround.x / uSize.x;
    float sil = t > 0.0 ? alphaAtBias(vec2(sx, suv.y), 2.5) : 0.0;
    float longShadow = sil * uLong * (1.0 - smoothstep(0.0, 1.0, t)) * smoothstep(-0.02, 0.06, t);
    float a = clamp(max(blob * 0.85, longShadow), 0.0, 1.0) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export default async function create(ctx, opts = {}) {
  const { THREE, palette, reducedMotion } = ctx;
  const {
    src = `${import.meta.env.BASE_URL}assets/toji.png`,
    key = 'alpha',
    from = -7,
    to = 6.5,
    x = 0,
    height = 1.9,
    stride = 0.78,
    rim = 3.2,
    rimWidth = 0.016,
    warm = 1.2,
    lanterns = [2, -5.5],
    shadow = 0.75,
    longShadow = 0.4,
    shadowLength = 3.2,
  } = opts;

  const group = new THREE.Group();
  group.name = 'toji';

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      map: { value: null },
      uKey: { value: 0 },
      uKeyParams: { value: new THREE.Vector3(0.08, 0.12, 0.85) },
      uSize: { value: new THREE.Vector2(1, 2) },
      uFeet: { value: 0.02 },
      uSway: { value: 0 },
      uRimUv: { value: new THREE.Vector2(0.01, 0.01) },
      uRimDir: { value: new THREE.Vector2(0.42, 1).normalize() },
      uRimColor: { value: new THREE.Color(palette.red) },
      uRimStrength: { value: rim },
      uWarmColor: { value: new THREE.Color(palette.orange) },
      uWarm: { value: 0 },
      uUnder: { value: 0.12 },
      uExposure: { value: 0.75 },
      uSaturation: { value: 0.72 },
      uShadowTint: { value: new THREE.Color(palette.navy).multiplyScalar(0.18) },
      uShadowTintAmount: { value: 0.6 },
      uGlint: { value: 1.2 },
      uOpacity: { value: 1 },
    },
  ]);

  const billboardGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    fog: true,
  });
  const billboard = new THREE.Mesh(billboardGeometry, material);
  billboard.name = 'toji-billboard';
  // The vertex shader places the quad itself, so the geometry's bounds mean nothing to culling.
  billboard.frustumCulled = false;
  billboard.renderOrder = 2;

  // Moon at ≈ (14, 26, −95): its shadow falls toward the camera, slightly to the left.
  const moonDir = new THREE.Vector3(14, 26, -95).normalize();
  const shadowUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      map: { value: null },
      uKey: { value: 0 },
      uKeyParams: { value: uniforms.uKeyParams.value },
      uSize: { value: uniforms.uSize.value },
      uFeet: { value: 0.02 },
      uShadowDir: { value: new THREE.Vector2(-moonDir.x, -moonDir.z).normalize() },
      uShadowLength: { value: shadowLength / height },
      uPad: { value: 0.12 },
      uColor: { value: new THREE.Color(palette.ink) },
      uOpacity: { value: shadow },
      uLong: { value: longShadow },
    },
  ]);
  // Share vector objects so size/key changes reach both materials.
  shadowUniforms.uSize.value = uniforms.uSize.value;
  shadowUniforms.uKeyParams.value = uniforms.uKeyParams.value;

  const shadowMaterial = new THREE.ShaderMaterial({
    uniforms: shadowUniforms,
    vertexShader: shadowVertexShader,
    fragmentShader: shadowFragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), shadowMaterial);
  shadowMesh.name = 'toji-shadow';
  shadowMesh.frustumCulled = false;
  shadowMesh.position.y = 0.02;
  shadowMesh.renderOrder = 1;

  group.add(shadowMesh, billboard);

  let texture = null;
  function applyTexture(next, { key: mode = 'alpha', feet = 0.02, head = 0.97 } = {}) {
    const image = next.image;
    const w = image.width;
    const h = image.height;
    next.colorSpace = THREE.SRGBColorSpace;
    next.anisotropy = 4;
    next.needsUpdate = true;
    texture?.dispose();
    texture = next;
    const planeH = height / (head - feet);
    uniforms.uSize.value.set(planeH * (w / h), planeH);
    uniforms.uFeet.value = feet;
    shadowUniforms.uFeet.value = feet;
    uniforms.uRimUv.value.set(rimWidth / (planeH * (w / h)), rimWidth / planeH);
    uniforms.map.value = next;
    shadowUniforms.map.value = next;
    uniforms.uKey.value = KEYS[mode] ?? 0;
    shadowUniforms.uKey.value = uniforms.uKey.value;
  }

  async function setTexture(url, options = {}) {
    // fetch first so a missing file (or a dev-server HTML fallback) is detected without a decode error.
    const res = await fetch(url);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) throw new Error(`toji: no image at ${url}`);
    const objectUrl = URL.createObjectURL(await res.blob());
    try {
      const next = await new THREE.TextureLoader().loadAsync(objectUrl);
      applyTexture(next, options);
      return true;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function usePlaceholder() {
    const canvas = document.createElement('canvas');
    const layout = drawPlaceholder(canvas);
    applyTexture(new THREE.CanvasTexture(canvas), { key: 'alpha', ...layout });
  }

  let loaded = false;
  if (src) loaded = await setTexture(src, { key }).catch(() => false);
  if (!loaded) usePlaceholder();

  // --- walking ---------------------------------------------------------------
  const api = {
    object: group,
    walk: opts.walk ?? 0,
    uniforms,
    shadowUniforms,
    setTexture,
    update,
    dispose,
  };

  let lastWalk = api.walk;
  let steps = 0;
  let moving = 0;

  function place(delta) {
    const z = THREE.MathUtils.lerp(from, to, api.walk);
    const dz = (api.walk - lastWalk) * (to - from);
    lastWalk = api.walk;
    if (delta > 0) {
      // Stride intensity follows how fast walk is changing (≈1.4 m/s reads as a full walk).
      const target = Math.min(Math.abs(dz) / delta / 1.4, 1);
      moving += (target - moving) * (1 - Math.exp(-delta * 6));
      steps += Math.abs(dz) / stride;
    }
    const m = reducedMotion ? 0 : moving;
    const bob = m * 0.035 * (0.5 - 0.5 * Math.cos(steps * Math.PI * 2));
    const sway = Math.sin(steps * Math.PI);
    group.position.set(x + sway * 0.025 * m, 0, z);
    billboard.position.y = bob;
    uniforms.uSway.value = sway * 0.022 * m;

    // Warm side light peaks while passing each lantern pair.
    let near = 0;
    for (const lz of lanterns) near = Math.max(near, Math.exp(-((z - lz) ** 2) / (2 * 1.6 ** 2)));
    uniforms.uWarm.value = warm * near;
  }

  function update(time, delta) {
    place(delta);
  }

  function dispose() {
    texture?.dispose();
    billboardGeometry.dispose();
    shadowMesh.geometry.dispose();
    material.dispose();
    shadowMaterial.dispose();
  }

  place(0);
  return api;
}

// --- placeholder art ----------------------------------------------------------

/**
 * Paints Toji as a near-black silhouette on a transparent canvas (1280×1536, 2 m tall):
 * broad shoulders, messy hair, loose hakama gathered at the ankles, the Inverted Spear of Heaven
 * in his right hand (viewer's left) with its chain, the Split Soul Katana in his left.
 * Returns { feet, head } fractions for setTexture/applyTexture.
 */
export function drawPlaceholder(canvas) {
  const W = 1280;
  const H = 1536;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const ppm = H / 2; // pixels per metre
  const footY = 1500;
  // Figure space: metres, x right (viewer), y up from the soles.
  const P = (x, y) => [W / 2 + x * ppm, footY - y * ppm];

  /** Catmull-Rom through points; a third element `1` makes a sharp corner. */
  function shape(points, closed = true) {
    const pts = points.map(([x, y, sharp]) => [...P(x, y), sharp]);
    const n = pts.length;
    const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    g.moveTo(pts[0][0], pts[0][1]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);
      const k1 = p1[2] ? 0 : 1 / 6;
      const k2 = p2[2] ? 0 : 1 / 6;
      g.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) * k1,
        p1[1] + (p2[1] - p0[1]) * k1,
        p2[0] - (p3[0] - p1[0]) * k2,
        p2[1] - (p3[1] - p1[1]) * k2,
        p2[0],
        p2[1],
      );
    }
    if (closed) g.closePath();
  }
  const fill = (color, points) => {
    g.beginPath();
    shape(points);
    g.fillStyle = color;
    g.fill();
  };
  const stroke = (color, width, points, closed = false) => {
    g.beginPath();
    shape(points, closed);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();
  };
  const mirror = (pts) => pts.map(([x, y, s]) => [-x, y, s]).reverse();

  const C = {
    cloth: '#0c0e13',
    hakama: '#0f121a',
    fold: '#181d28',
    crease: '#06070a',
    skin: '#17120f',
    skinLit: '#221a15',
    hair: '#050608',
    wrap: '#1a1d24',
    steel: '#252b34',
    steelDark: '#13171d',
    edge: '#eef3f8',
    chain: '#2b313b',
    chainLit: '#5d6672',
  };

  // --- chain (behind the hand, over the hakama: drawn after the body) and weapons are below.

  // Hakama: loose, billowing, gathered at the ankles; his left leg (viewer's right) steps forward.
  const hakamaLeft = [
    [-0.172, 1.0],
    [-0.215, 0.9],
    [-0.252, 0.74],
    [-0.272, 0.56],
    [-0.268, 0.4],
    [-0.245, 0.27],
    [-0.205, 0.18],
    [-0.165, 0.135, 1],
    [-0.158, 0.08],
    [-0.152, 0.05, 1],
    [-0.078, 0.05, 1],
    [-0.072, 0.09],
    [-0.074, 0.135, 1],
    [-0.05, 0.22],
    [-0.03, 0.36],
    [-0.012, 0.52],
    [0.0, 0.6, 1],
  ];
  const hakamaRight = [
    [0.014, 0.5],
    [0.035, 0.34],
    [0.062, 0.2],
    [0.076, 0.12, 1],
    [0.074, 0.07],
    [0.08, 0.025, 1],
    [0.162, 0.025, 1],
    [0.168, 0.07],
    [0.175, 0.12, 1],
    [0.222, 0.17],
    [0.262, 0.26],
    [0.284, 0.4],
    [0.282, 0.56],
    [0.262, 0.74],
    [0.222, 0.9],
    [0.176, 1.0],
  ];
  fill(C.hakama, [...hakamaLeft, ...hakamaRight]);

  // Hakama folds: soft lighter ridges converging toward the gathered ankles, dark creases between.
  for (const [x0, x1, y1, side] of [
    [-0.15, -0.2, 0.2, -1],
    [-0.1, -0.13, 0.17, -1],
    [-0.055, -0.09, 0.18, -1],
    [0.06, 0.1, 0.15, 1],
    [0.11, 0.14, 0.14, 1],
    [0.16, 0.2, 0.17, 1],
  ]) {
    stroke(C.fold, 7, [
      [x0, 0.95],
      [x0 + side * 0.035, 0.7],
      [x1 + side * 0.03, 0.42],
      [x1, y1],
    ]);
    stroke(C.crease, 4, [
      [x0 + 0.025, 0.93],
      [x0 + 0.025 + side * 0.04, 0.66],
      [x1 + 0.02 + side * 0.03, 0.4],
      [x1 + 0.018, y1 + 0.02],
    ]);
  }
  // Ankle wraps.
  for (const [cx, cy, wd] of [
    [-0.115, 0.1, 0.085],
    [0.122, 0.075, 0.09],
  ]) {
    for (let i = 0; i < 3; i++) {
      stroke(C.wrap, 6, [
        [cx - wd / 2, cy + i * 0.022 - 0.004],
        [cx, cy + i * 0.022 + 0.006],
        [cx + wd / 2, cy + i * 0.022 - 0.002],
      ]);
    }
  }
  // Feet (sandals), the forward foot slightly larger and lower.
  fill('#0a0b0e', [
    [-0.17, 0.052],
    [-0.115, 0.07],
    [-0.06, 0.052],
    [-0.055, 0.02, 1],
    [-0.115, 0.004],
    [-0.175, 0.02, 1],
  ]);
  fill('#0a0b0e', [
    [0.058, 0.03],
    [0.12, 0.05],
    [0.185, 0.03],
    [0.19, -0.004, 1],
    [0.12, -0.02],
    [0.052, -0.004, 1],
  ]);

  // Torso: heavy trapezius, deep chest, lats tapering into the waist.
  const torsoLeft = [
    [-0.062, 1.69],
    [-0.07, 1.625],
    [-0.13, 1.585],
    [-0.2, 1.555],
    [-0.25, 1.53],
    [-0.272, 1.47],
    [-0.258, 1.38],
    [-0.232, 1.3],
    [-0.218, 1.2],
    [-0.19, 1.1],
    [-0.168, 1.04],
    [-0.178, 0.96, 1],
  ];
  fill(C.cloth, [...torsoLeft, ...mirror(torsoLeft)]);
  // Obi / belt.
  fill('#151821', [
    [-0.18, 1.03],
    [0.0, 1.04],
    [0.182, 1.03],
    [0.186, 0.965, 1],
    [0.0, 0.955],
    [-0.184, 0.965, 1],
  ]);
  stroke(C.crease, 3, [
    [-0.178, 0.995],
    [0.0, 1.0],
    [0.18, 0.995],
  ]);
  // Muscle definition (only visible up close): pecs, sternum, abs, lat lines.
  stroke('#141820', 4, [
    [-0.19, 1.43],
    [-0.1, 1.39],
    [-0.02, 1.4],
  ]);
  stroke('#141820', 4, [
    [0.02, 1.4],
    [0.1, 1.39],
    [0.19, 1.43],
  ]);
  stroke(C.crease, 3, [
    [0.0, 1.47],
    [0.0, 1.06],
  ]);
  for (const y of [1.3, 1.22, 1.14]) {
    stroke('#11141b', 3, [
      [-0.07, y + 0.01],
      [-0.02, y],
    ]);
    stroke('#11141b', 3, [
      [0.02, y],
      [0.07, y + 0.01],
    ]);
  }
  stroke('#11141b', 4, [
    [-0.2, 1.36],
    [-0.17, 1.22],
    [-0.15, 1.1],
  ]);
  stroke('#11141b', 4, [
    [0.2, 1.36],
    [0.17, 1.22],
    [0.15, 1.1],
  ]);

  // Neck.
  fill(C.skin, [
    [-0.06, 1.7],
    [-0.066, 1.63],
    [-0.09, 1.595],
    [0.0, 1.58],
    [0.09, 1.595],
    [0.066, 1.63],
    [0.06, 1.7],
  ]);
  // Collar line of the fitted shirt.
  stroke(C.cloth, 9, [
    [-0.095, 1.6],
    [0.0, 1.575],
    [0.095, 1.6],
  ]);

  // Arms: his right (viewer's left) and left (viewer's right) — deltoid, biceps, forearm, slightly out.
  const arm = (s, out) => [
    [s * 0.23, 1.555],
    [s * 0.285, 1.525],
    [s * 0.318, 1.46],
    [s * 0.33, 1.38],
    [s * 0.334, 1.3],
    [s * (0.338 + out * 0.3), 1.21],
    [s * (0.358 + out * 0.6), 1.12],
    [s * (0.366 + out), 1.03],
    [s * (0.357 + out), 0.955, 1],
    [s * (0.302 + out), 0.955, 1],
    [s * (0.292 + out * 0.8), 1.04],
    [s * (0.282 + out * 0.6), 1.12],
    [s * (0.262 + out * 0.3), 1.2],
    [s * 0.25, 1.3],
    [s * 0.235, 1.38],
    [s * 0.215, 1.45],
  ];
  const armLeft = arm(-1, 0);
  const armRight = arm(1, 0.012);
  fill(C.skin, armLeft);
  fill(C.skin, armRight);
  // Fitted short sleeves.
  for (const s of [-1, 1]) {
    fill(C.cloth, [
      [s * 0.215, 1.56],
      [s * 0.288, 1.528],
      [s * 0.322, 1.455],
      [s * 0.334, 1.37, 1],
      [s * 0.236, 1.36, 1],
      [s * 0.21, 1.45],
    ]);
    // Biceps / forearm separation for close-ups.
    stroke(C.skinLit, 3, [
      [s * 0.322, 1.33],
      [s * 0.33, 1.26],
      [s * 0.336, 1.2],
    ]);
    stroke('#0e0b0a', 3, [
      [s * 0.27, 1.22],
      [s * 0.3, 1.18],
      [s * 0.33, 1.17],
    ]);
  }

  // Head, slightly lowered, jaw square.
  fill(C.skin, [
    [0.0, 1.655],
    [0.038, 1.664],
    [0.064, 1.695],
    [0.075, 1.735],
    [0.087, 1.748],
    [0.09, 1.782],
    [0.08, 1.8],
    [0.08, 1.835],
    [0.06, 1.868],
    [0.0, 1.885],
    [-0.06, 1.868],
    [-0.08, 1.835],
    [-0.08, 1.8],
    [-0.09, 1.782],
    [-0.087, 1.748],
    [-0.075, 1.735],
    [-0.064, 1.695],
    [-0.038, 1.664],
  ]);
  // Brow shadow and the scar at the right corner of his mouth (viewer's left).
  stroke('#0b0908', 6, [
    [-0.055, 1.775],
    [-0.02, 1.768],
  ]);
  stroke('#0b0908', 6, [
    [0.02, 1.768],
    [0.055, 1.775],
  ]);
  stroke('#2a201b', 2.5, [
    [-0.03, 1.71],
    [-0.018, 1.695],
  ]);

  // Messy short hair: jagged tufts all round, a few strands falling over the brow.
  fill(C.hair, [
    [-0.086, 1.782],
    [-0.094, 1.805],
    [-0.112, 1.828, 1],
    [-0.09, 1.836],
    [-0.106, 1.866, 1],
    [-0.078, 1.872],
    [-0.088, 1.905, 1],
    [-0.052, 1.896],
    [-0.042, 1.928, 1],
    [-0.016, 1.906],
    [0.008, 1.934, 1],
    [0.028, 1.908],
    [0.058, 1.924, 1],
    [0.066, 1.896],
    [0.098, 1.9, 1],
    [0.086, 1.866],
    [0.114, 1.85, 1],
    [0.09, 1.83],
    [0.102, 1.8, 1],
    [0.086, 1.782, 1],
    [0.07, 1.8],
    [0.052, 1.787, 1],
    [0.036, 1.812],
    [0.016, 1.782, 1],
    [0.0, 1.808],
    [-0.022, 1.786, 1],
    [-0.04, 1.814],
    [-0.062, 1.793, 1],
    [-0.074, 1.81],
  ]);

  // Chain of the Inverted Spear: hangs from the pommel in a loop and back up to his hip.
  const chainPts = [];
  const pommel = [-0.296, 0.985];
  const hip = [-0.13, 0.985];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    // Catenary-ish sag between pommel and hip, swinging outward first.
    const x = pommel[0] + (hip[0] - pommel[0]) * t - Math.sin(t * Math.PI) * 0.03;
    const y = pommel[1] + (hip[1] - pommel[1]) * t - Math.sin(t * Math.PI) * 0.58 * (1 - 0.25 * t);
    chainPts.push([x, y]);
  }
  drawChain(g, chainPts.map(([x, y]) => P(x, y)), C);

  // Fists over the grips.
  const fist = (cx, cy, s) =>
    fill(C.skinLit, [
      [cx - 0.042 * s, cy + 0.045],
      [cx + 0.04 * s, cy + 0.05],
      [cx + 0.05 * s, cy - 0.01],
      [cx + 0.038 * s, cy - 0.05],
      [cx - 0.035 * s, cy - 0.052],
      [cx - 0.05 * s, cy - 0.005],
    ]);

  // Inverted Spear of Heaven: short forked dagger, point down and slightly out.
  {
    const hand = [-0.328, 0.905];
    const ang = (18 * Math.PI) / 180;
    const d = [-Math.sin(ang), -Math.cos(ang)];
    const n = [-d[1], d[0]];
    const at = (t, o = 0) => [hand[0] + d[0] * t + n[0] * o, hand[1] + d[1] * t + n[1] * o];
    // Grip + pommel ring above the fist.
    fill(C.steelDark, [at(-0.075, -0.014), at(-0.075, 0.014), at(0.06, 0.013), at(0.06, -0.013)]);
    g.beginPath();
    g.arc(...P(...at(-0.088)), 0.016 * ppm, 0, Math.PI * 2);
    g.lineWidth = 0.008 * ppm;
    g.strokeStyle = C.chain;
    g.stroke();
    // Cross guard.
    fill(C.steel, [at(0.055, -0.05, 1), at(0.055, 0.05, 1), at(0.075, 0.042, 1), at(0.075, -0.042, 1)].map((p) => [...p, 1]));
    // Blade: straight, then splitting into two diverging prongs.
    const blade = [
      [...at(0.075, -0.017), 1],
      [...at(0.25, -0.014), 1],
      [...at(0.37, -0.04), 1], // outer prong tip
      [...at(0.262, -0.002), 1],
      [...at(0.36, 0.034), 1], // inner prong tip
      [...at(0.25, 0.014), 1],
      [...at(0.075, 0.017), 1],
    ];
    fill(C.steel, blade);
    stroke(C.edge, 2.5, [at(0.08, -0.015), at(0.25, -0.013), at(0.365, -0.038)].map((p) => [...p, 1]));
    stroke(C.edge, 2, [at(0.262, 0.0), at(0.355, 0.032)].map((p) => [...p, 1]));
    stroke(C.steelDark, 2, [at(0.08, 0.0), at(0.24, 0.0)].map((p) => [...p, 1]));
    fist(hand[0], hand[1], -1);
  }

  // Split Soul Katana: long blade angled down and out from his left hand.
  {
    const hand = [0.342, 0.9];
    const ang = (21 * Math.PI) / 180;
    const d = [Math.sin(ang), -Math.cos(ang)];
    const n = [-d[1], d[0]];
    const at = (t, o = 0) => [hand[0] + d[0] * t + n[0] * o, hand[1] + d[1] * t + n[1] * o];
    // Tsuka (wrapped grip) running up behind the forearm.
    fill('#0a0b0f', [at(-0.24, -0.016), at(-0.24, 0.016), at(0.05, 0.017), at(0.05, -0.017)].map((p) => [...p, 1]));
    for (let t = -0.22; t < 0.04; t += 0.035) stroke('#1d212a', 3, [at(t, -0.015), at(t + 0.02, 0.015)].map((p) => [...p, 1]));
    // Tsuba seen nearly edge-on.
    g.save();
    g.translate(...P(...at(0.06)));
    g.rotate(-ang);
    g.beginPath();
    g.ellipse(0, 0, 0.042 * ppm, 0.011 * ppm, 0, 0, Math.PI * 2);
    g.fillStyle = C.steel;
    g.fill();
    g.restore();
    // Blade with a slight sori (curve) and a sharp kissaki.
    const L = 0.74;
    const bow = (t) => Math.sin((t / L) * Math.PI) * 0.018;
    const spine = [];
    const edge = [];
    for (let i = 0; i <= 16; i++) {
      const t = 0.07 + ((L - 0.07) * i) / 16;
      const w = 0.016 * (1 - (i / 16) * 0.25);
      spine.push([...at(t, -w + bow(t)), 1]);
      edge.push([...at(t, w + bow(t)), 1]);
    }
    const tip = [...at(L + 0.045, bow(L) - 0.01), 1];
    fill(C.steel, [...spine, tip, ...edge.reverse()]);
    // Hamon-ish line and the bright cutting edge.
    stroke('#3c4552', 2, spine.map(([px, py], i) => [px + (edge[16 - i][0] - px) * 0.55, py + (edge[16 - i][1] - py) * 0.55, 1]));
    stroke(C.edge, 3, [...edge.slice().reverse().slice(1), tip]);
    fist(hand[0], hand[1], 1);
  }

  return { feet: (H - footY) / H, head: (H - (footY - 1.9 * ppm)) / H };
}

/** Chain links along a polyline (canvas px): alternating open ovals and edge-on bars. */
function drawChain(g, pts, C) {
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  const step = 11;
  let j = 0;
  for (let s = 0, k = 0; s < total; s += step, k++) {
    while (j < lengths.length - 2 && lengths[j + 1] < s) j++;
    const t = (s - lengths[j]) / (lengths[j + 1] - lengths[j] || 1);
    const x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t;
    const y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t;
    const ang = Math.atan2(pts[j + 1][1] - pts[j][1], pts[j + 1][0] - pts[j][0]);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    if (k % 2 === 0) {
      g.ellipse(0, 0, 8, 4.6, 0, 0, Math.PI * 2);
      g.lineWidth = 3;
      g.strokeStyle = C.chain;
      g.stroke();
      g.beginPath();
      g.ellipse(0, 0, 8, 4.6, 0, Math.PI * 1.1, Math.PI * 1.7);
      g.strokeStyle = C.chainLit;
      g.lineWidth = 1.5;
      g.stroke();
    } else {
      g.rect(-8, -1.8, 16, 3.6);
      g.fillStyle = C.chain;
      g.fill();
    }
    g.restore();
  }
}
