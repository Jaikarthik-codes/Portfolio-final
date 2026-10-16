import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

/**
 * The owner's name as giant weathered blackletter monoliths standing in the scene
 * (Pirata One, extruded), "Jai" left of the path and "Karthik" right, with "Mylapur" smaller.
 *
 * Font: public/fonts/pirata-one.typeface.json (built by scripts/build-font.mjs; kerning baked in).
 *
 * create(ctx, opts) — async (loads the typeface). opts (all optional):
 *   fontUrl        typeface JSON url
 *   depth          extrusion depth in metres (0.38)
 *   bevel          { thickness, size, segments }
 *   curveSegments  per glyph curve (high 5 / low 3)
 *   sink           how far letters sit below y = 0 (0.05)
 *   glow           face emissive strength (0.12) — enough to read at night, not neon
 *   grime          0..1 weathering amount (1)
 *   words          { mylapur, jai, karthik } each merged over the defaults:
 *                    { text, cap (cap height m), position [x,y,z] anchor, align 'start'|'end'|'center',
 *                      yaw (rad, about +y), tracking (em), visible }
 *   rise           initial setRise value (1 = standing)
 *   stagger        0..1 share of the rise spent staggering letters (0.65)
 *
 * Returns {
 *   object,
 *   words: { mylapur, jai, karthik } each { group, letters: Mesh[], setRise(t) },
 *   letters,                 all letter meshes in reading order
 *   material,                the shared MeshStandardMaterial (uniforms on material.userData.uniforms)
 *   setRise(t),              0 = hidden below ground and tilted back, 1 = at rest; per-letter stagger
 *   setGlow(v),              face emissive strength
 *   rise,                    last value passed to setRise
 * }
 * Each letter mesh has its pivot at its own baseline-centre (x = ink centre, y = baseline,
 * z = middle of the extrusion), and userData.rest = { position, rotation } in its word group's space,
 * plus userData.char / userData.word / userData.index.
 */

const DEFAULT_WORDS = {
  // A smaller line floating over "Jai", right-aligned to the path like it, so the name reads
  // top-left to right: Mylapur / Jai | Karthik.
  mylapur: { text: 'Mylapur', cap: 0.6, position: [-1.45, 3.15, 3.55], align: 'end', yaw: -0.56, tracking: 0.03 },
  // The two big words splay back from the path like a corridor leading to the gate.
  jai: { text: 'Jai', cap: 2.15, position: [-1.35, 0, 3.4], align: 'end', yaw: -0.56, tracking: 0 },
  karthik: { text: 'Karthik', cap: 2.15, position: [1.35, 0, 3.4], align: 'start', yaw: 0.56, tracking: 0 },
};
const ORDER = ['mylapur', 'jai', 'karthik'];

export default async function create(ctx, opts = {}) {
  const { THREE, palette, quality } = ctx;
  const {
    fontUrl = `${import.meta.env.BASE_URL}fonts/pirata-one.typeface.json`,
    depth = 0.38,
    curveSegments = quality === 'low' ? 3 : 5,
    sink = 0.05,
    glow = 0.2,
    grime = 1,
    rise = 1,
    stagger = 0.65,
  } = opts;
  const bevel = { thickness: 0.03, size: 0.022, segments: quality === 'low' ? 1 : 2, ...opts.bevel };

  const font = await new FontLoader().loadAsync(fontUrl);
  const data = font.data;
  const capUnits = data.capHeight ?? 793;
  const kerning = data.kerning ?? {};

  const group = new THREE.Group();
  group.name = 'name';

  const material = createMaterial(THREE, palette, { glow, grime });

  // Geometry is shared per (char, cap) — the shader seeds its weathering from each mesh's
  // world position, so repeated letters still look different.
  const geometryCache = new Map();
  function glyphGeometry(char, size, k) {
    const key = `${char}|${size}|${k}`;
    if (geometryCache.has(key)) return geometryCache.get(key);
    const d = depth * k;
    const geometry = new TextGeometry(char, {
      font,
      size,
      depth: d,
      curveSegments,
      bevelEnabled: true,
      bevelThickness: bevel.thickness * Math.sqrt(k),
      bevelSize: bevel.size * Math.sqrt(k),
      bevelSegments: bevel.segments,
    });
    tagSides(THREE, geometry, d - 1e-4);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    // Pivot at the baseline-centre of the ink, centred through the extrusion.
    const cx = (box.min.x + box.max.x) / 2;
    geometry.translate(-cx, 0, -d / 2);
    geometry.userData.inkCenter = cx;
    geometry.userData.inkBottom = box.min.y + bevel.size * Math.sqrt(k);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometryCache.set(key, geometry);
    return geometry;
  }

  const words = {};
  const letters = [];

  for (const name of ORDER) {
    const def = { ...DEFAULT_WORDS[name], ...opts.words?.[name] };
    // Words standing on the ground lift long descenders (the J) clear of the earth so they still read.
    const groundDescenders = def.groundDescenders ?? def.position[1] < 0.5;
    if (def.visible === false || !def.text) continue;

    const size = (def.cap / capUnits) * data.resolution;
    // Smaller words get proportionally thinner slabs so they don't read as blocks.
    const thickness = THREE.MathUtils.clamp(def.cap / 2.2, 0.35, 1);
    const scale = size / data.resolution;
    const chars = Array.from(def.text);

    // Lay out with glyph advances + baked GPOS kerning + optional tracking (em).
    let pen = 0;
    let inkStart = Infinity;
    let inkEnd = -Infinity;
    const placed = chars.map((char, i) => {
      const glyph = data.glyphs[char] ?? data.glyphs['?'];
      const x = pen;
      inkStart = Math.min(inkStart, x + glyph.x_min * scale);
      inkEnd = Math.max(inkEnd, x + glyph.x_max * scale);
      pen += (glyph.ha + (kerning[char + (chars[i + 1] ?? '')] ?? 0)) * scale + def.tracking * size;
      return { char, x };
    });
    const shift = def.align === 'end' ? -inkEnd : def.align === 'center' ? -(inkStart + inkEnd) / 2 : -inkStart;

    const wordGroup = new THREE.Group();
    wordGroup.name = `name-${name}`;
    wordGroup.position.set(def.position[0], def.position[1] - sink, def.position[2]);
    wordGroup.rotation.y = def.yaw;

    const wordLetters = [];
    for (const { char, x } of placed) {
      if (char === ' ') continue;
      const geometry = glyphGeometry(char, size, thickness);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `letter-${name}-${wordLetters.length}-${char}`;
      const descender = -geometry.userData.inkBottom / scale;
      const lift = groundDescenders && descender > 60 ? -geometry.userData.inkBottom : 0;
      mesh.position.set(x + shift + geometry.userData.inkCenter, lift, 0);
      mesh.userData = {
        char,
        word: name,
        index: wordLetters.length,
        cap: def.cap,
        lift,
        rest: { position: mesh.position.clone(), rotation: mesh.rotation.clone() },
        jitter: (hash(letters.length + 1) - 0.5) * 2,
      };
      wordGroup.add(mesh);
      wordLetters.push(mesh);
      letters.push(mesh);
    }
    group.add(wordGroup);

    // Ground words rise out of the earth; floating words flip up from lying flat.
    const reveal = def.reveal ?? (groundDescenders ? 'rise' : 'flip');
    words[name] = {
      group: wordGroup,
      letters: wordLetters,
      setRise: (t) => riseLetters(wordLetters, t, reveal),
    };
  }

  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function riseLetters(list, t, reveal) {
    const n = list.length;
    const span = 1 - stagger;
    list.forEach((mesh, i) => {
      const start = n > 1 ? (i / (n - 1)) * stagger : 0;
      const local = THREE.MathUtils.clamp((t - start) / span, 0, 1);
      const h = 1 - ease(local);
      const { rest, cap, lift, jitter } = mesh.userData;
      const p = rest.position;
      const r = rest.rotation;
      if (reveal === 'flip') {
        mesh.position.set(p.x, p.y - cap * 0.35 * h, p.z);
        mesh.rotation.set(r.x - (Math.PI / 2) * h, r.y, r.z + jitter * 0.15 * h);
      } else {
        // Fully below ground, leaning back, with a little random roll.
        const drop = cap * 1.3 + lift + depth;
        mesh.position.set(p.x, p.y - drop * h, p.z - 0.25 * h);
        mesh.rotation.set(r.x - 0.55 * h, r.y, r.z + jitter * 0.22 * h);
      }
      mesh.visible = local > 0;
    });
  }

  const api = {
    object: group,
    words,
    letters,
    material,
    rise,
    /** 0 = hidden below ground, 1 = standing. Words overlap in reading order. */
    setRise(t) {
      api.rise = t;
      const list = ORDER.filter((k) => words[k]).map((k) => words[k]);
      // Rise "Jai Karthik" together and let "Mylapur" trail slightly, so the big name lands first.
      for (const w of list) {
        const isSmall = w === words.mylapur;
        const local = isSmall ? THREE.MathUtils.clamp((t - 0.25) / 0.75, 0, 1) : THREE.MathUtils.clamp(t / 0.85, 0, 1);
        w.setRise(local);
      }
    },
    setGlow(v) {
      material.userData.uniforms.uGlow.value = v;
    },
    dispose() {
      for (const g of geometryCache.values()) g.dispose();
      material.dispose();
    },
  };
  api.setRise(rise);
  return api;
}

/** Deterministic 0..1 hash so the layout is identical on every load. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Bakes ExtrudeGeometry's material groups into an attribute so each letter is one draw call:
 * aSide = 0 caps, 1 side walls, 2 the front bevel (a worn chamfer in the face colour).
 */
function tagSides(THREE, geometry, frontZ) {
  const pos = geometry.attributes.position;
  const side = new Float32Array(pos.count);
  for (const g of geometry.groups) {
    if (g.materialIndex !== 1) continue;
    for (let i = g.start; i < g.start + g.count; i += 3) {
      const front = pos.getZ(i) > frontZ && pos.getZ(i + 1) > frontZ && pos.getZ(i + 2) > frontZ;
      side.fill(front ? 2 : 1, i, i + 3);
    }
  }
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geometry.clearGroups();
}

function createMaterial(THREE, palette, { glow, grime }) {
  const uniforms = {
    // Warmer than sand: the front faces only see the cool fill, so they'd otherwise read grey.
    uFace: { value: new THREE.Color(palette.sand).lerp(new THREE.Color(palette.ember), 0.3) },
    uGlowColor: { value: new THREE.Color(palette.sand).lerp(new THREE.Color(palette.ember), 0.35) },
    uSide: { value: new THREE.Color(palette.wine) },
    uGrime: { value: new THREE.Color(palette.earth).lerp(new THREE.Color(palette.moss), 0.7) },
    uGlow: { value: glow },
    uGrimeAmount: { value: grime },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 });
  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () => 'name-letters';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSide;
        varying float vSide;
        varying vec3 vLocal;
        varying vec3 vSeed;
        varying float vGroundY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSide = aSide;
        vLocal = position;
        vGroundY = (modelMatrix * vec4(position, 1.0)).y;
        vSeed = vec3(modelMatrix[3].x, 0.0, modelMatrix[3].z) * 1.37;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uFace;
        uniform vec3 uSide;
        uniform vec3 uGrime;
        uniform float uGlow;
        uniform vec3 uGlowColor;
        uniform float uGrimeAmount;
        varying float vSide;
        varying vec3 vLocal;
        varying vec3 vSeed;
        varying float vGroundY;
        float nHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float nNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(nHash(i), nHash(i + vec3(1, 0, 0)), f.x), mix(nHash(i + vec3(0, 1, 0)), nHash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(nHash(i + vec3(0, 0, 1)), nHash(i + vec3(1, 0, 1)), f.x), mix(nHash(i + vec3(0, 1, 1)), nHash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }
        float nFbm(vec3 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { s += a * nNoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
          return s / 0.9375;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 p = vLocal + vSeed;
        float mottled = nFbm(p * 2.3);
        float specks = smoothstep(0.78, 0.9, nNoise(p * 38.0)) * 0.5;
        // Rain streaks: noise stretched vertically, darkening down from the letter tops.
        float streak = smoothstep(0.55, 0.9, nNoise(vec3(p.x * 14.0, p.y * 0.8, p.z * 14.0)));
        // Ground grime (world height) climbs higher in noisy patches; moss creeps up from the base.
        float base = 1.0 - smoothstep(-0.05, 0.95, vGroundY + (mottled - 0.5) * 0.8);
        float dirt = clamp(base * 0.9 + streak * 0.16 + specks * 0.35, 0.0, 1.0) * uGrimeAmount;
        float wall = clamp(vSide, 0.0, 1.0) * step(vSide, 1.5);
        float chamfer = step(1.5, vSide);
        vec3 face = uFace * mix(0.6, 0.78, mottled) * (1.0 - chamfer * 0.18);
        face = mix(face, uGrime, dirt * 0.85);
        vec3 side = uSide * mix(0.32, 0.6, mottled);
        side = mix(side, uGrime * 0.5, base * 0.6 * uGrimeAmount);
        diffuseColor.rgb = mix(face, side, wall);
        float nameDirt = dirt;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.8, 1.0, mottled);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uGlowColor * uGlow * (1.0 - wall) * (1.0 - nameDirt) * mix(0.7, 1.0, mottled);`,
      );
  };
  return material;
}
