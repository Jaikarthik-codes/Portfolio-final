# Portfolio — Build Spec

Personal 3D scroll portfolio for **Mylapur Jai Karthik — Aspiring AI Developer**.
Theme: anime (Jujutsu Kaisen). The hero is **Toji Fushiguro walking out of a torii gate at night under a blood moon**,
holding the Inverted Spear of Heaven and the Split Soul Katana, with lit stone lanterns.

Stack: Vite · three.js r186 · GSAP 3.15 (ScrollTrigger, SplitText, ScrambleTextPlugin, CustomEase — all free/bundled) ·
Lenis · `postprocessing` (pmndrs) 6.39. **Do not add dependencies.** Everything needed is installed.

Desktop is the priority for this pass (1440×900 and 1920×1080). A mobile pass comes later — don't hard-break below 768px.

---

## Art direction

- **Mood:** silent, dangerous, cinematic night. Deep navy/ink darkness, a huge blood moon, warm orange lantern pools,
  red maple leaves drifting, low fog hugging the ground. Think MAPPA background art translated into stylized real-time 3D.
- **References:** (1) "KAGE" site — low-poly-ish 3D shrine scene, huge letters standing *in* the scene with grass in front of them,
  red moon, falling red maple leaves, heavy film grain, editorial UI overlay (headline top-left, vertical Japanese on the right,
  scroll ticks, section counter, small card bottom-right). (2) Anime still — Toji walking out of a mossy, vine-covered
  torii in a dark forest, stone lanterns glowing either side, a stone path.
- **Rendering style:** stylized, not photoreal. `MeshStandardMaterial` with high roughness, `flatShading` where it helps the
  low-poly read, vertex-colour or noise variation instead of texture files. Silhouettes must read against the fog —
  depth comes from fog + rim light, not detail. Aged, weathered, mossy surfaces. Nothing glossy or plastic.
- **Light:** the blood moon is behind the gate (rim light on everything facing the camera), a softened royal-blue fill from
  front-left, warm orange point lights from lanterns. Emissive things (moon, lantern windows, embers, shrine windows)
  should be bright enough to bloom (post uses a luminance threshold ≈ 0.6–0.8 — emissive intensity > 1 to glow).

## Palette (`src/theme/palette.js`, mirrored in `src/styles/tokens.css`)

| Token | Hex | Use |
|---|---|---|
| ink | #05080D | zenith sky, page background |
| night | #0A1824 | deep sky, far silhouettes |
| navy | #153B54 | sky near horizon, cool shadows |
| fog | #0B1C2A | scene fog |
| royal | #014BAA | cool fill light, "AI" accents (sparingly) |
| wine | #7F011F | torii lacquer, moon shadow side, deep red |
| red | #C52B27 | blood moon, rim light, primary accent |
| orange | #EC5E27 | lantern light, embers, CTAs |
| ember | #FFB36B | lantern flame core |
| sand | #F5EBD0 | body text, pale moon, paper windows, letter faces |
| cream / milk | #F8F3F0 / #FDFDF1 | headline text, highlights |
| moss / earth / stone | #26321F / #1A1712 / #6B6A66 | foliage, ground, stone |

Always pull colours from `palette` (`new THREE.Color(palette.red)`), never hard-code new hexes without a reason.
Small derived variations (lerp between palette colours, per-instance jitter) are fine.

## World layout (metres, y up, +z toward the camera)

| Thing | Where |
|---|---|
| Ground | y = 0 for z > −10 |
| Stone path | centred x = 0, width 2.6 (x ±1.3), from z = 16 to z = −10 |
| Steps | z = −10 → −20, rising y 0 → 3 (10 steps × 0.3 m, tread 1.0 m), width 3.2 |
| Shrine terrace | y = 3 for z < −20; shrine hall centred (0, 3, −32), ~14 wide, ≤ 9 tall, facing +z |
| Torii gate | centred (0, 0, 0). Pillars at x = ±2.0, kasagi (top beam) top ≈ y 5.3, span ≈ 6.6; nuki (lower beam) ≈ y 4.0 |
| Stone lanterns (tōrō) | ~2.1 m tall. (±2.9, 0, 2.0), (±3.1, 0, −5.5), (±2.4, 3, −21) |
| Name letters (3D) | standing on the ground at z ≈ 3.2; "Jai" left of the path, "Karthik" right; a gap ≥ 2.6 around x = 0 for Toji to walk through. "Mylapur" smaller, placement decided at integration |
| Toji | billboard on the path, feet on y = 0, height ≈ 1.9 m. Walks from z = −7 (behind the gate, in fog) to z ≈ 6.5 |
| Moon | upper right behind the gate: centre ≈ (14, 26, −95), radius ≈ 9 |
| Cedar forest | \|x\| > 5.5 near the gate, widening with distance; z from 8 to −60; distant ridge silhouettes z −120…−180 |
| Red maples | ≈ (−5.5, 0, 1), (6, 0, −2), (−8, 0, 6), (8.5, 0, 5), (−4.5, 3, −24), (5, 3, −26) |
| Foreground grass | z 7…14 and \|x\| > 1.5 (dense, in front of the letters like the KAGE ref), patches at lantern/pillar bases |
| Leaves / particles volume | x −10…10, y 0…10, z −12…14 (follows the camera z if cheap) |

### Camera views every module must look good from

| View | `--cam` | `--target` |
|---|---|---|
| V1 hero rest | `0,1.55,13.5` | `0,2.6,0` |
| V2 low angle, Toji approaching | `0.8,0.9,8` | `0,2.4,0` |
| V3 through the gate | `0,1.7,-1` | `0,3,-30` |
| V4 intro wide | `0,3.2,26` | `0,3.5,-10` |

Hero scroll path: camera travels V4 → V1 (intro), then V1 → V2 → V3 while Toji walks out toward the camera and the
camera passes him and pushes through the gate.

## Module contract (`src/world/<name>.js`)

```js
/** JSDoc header: what it is + its public API */
export default function create(ctx, opts = {}) {
  // ctx = { THREE, scene, camera, renderer, palette, quality: 'high'|'low', reducedMotion, experience }
  const group = new THREE.Group();
  // ...build in WORLD coordinates per the layout table (caller just adds `object` to the scene)
  return {
    object: group,
    update(time, delta) {}, // optional, perpetual idle animation only (wind, flicker, drift)
    dispose() {},           // optional
    // + module-specific tweenable handles/props, documented in the header
  };
}
```

- `create` may be `async` (e.g. font/texture loading); the harness awaits it.
- **No GSAP inside world modules.** Expose plain numeric props / setters that GSAP timelines can tween at integration.
- Respect `ctx.quality` — `'low'` should roughly halve instance/particle counts. Respect `ctx.reducedMotion` for perpetual motion (reduce, don't freeze lights).
- **Fog:** every material must respect `scene.fog` (built-ins do automatically; `ShaderMaterial` needs `fog: true` +
  `#include <fog_pars_*>` / `<fog_vertex>` / `<fog_fragment>` and `THREE.UniformsUtils.merge([THREE.UniformsLib.fog, …])`).
  The sky dome and moon are the only exceptions.
- **Colour management:** renderer output is sRGB; `THREE.Color` from hex strings is converted automatically.
  Custom shaders should end with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`.
- **Performance budget (whole scene, quality high):** ≤ 150 draw calls, ≤ 500k triangles, ≤ 6 point lights.
  Use `InstancedMesh` / merged geometry (`BufferGeometryUtils.mergeGeometries`) for anything repeated. No shadow maps.
- Procedural only: no external texture/model files except the font and Toji art. Canvas-generated textures are fine.
- Keep code clean and readable; comment the *why*, sparingly, matching `src/scene/Experience.js`.

## File ownership (parallel build)

Each builder owns only its listed files. **Do not edit anyone else's files**, `package.json`, `src/scene/Experience.js`,
`src/world/lighting.js`, `src/theme/palette.js`, `dev/harness.*` or `dev/shot.mjs`. If something shared needs to change,
say so in your report instead. Temporary test modules go in `src/world/_<anything>.js` (excluded from `m=all`) and must be
deleted before you finish. Put screenshots in `shots/<your-module>/` (git-ignored).

## Verifying your work — required

```
node dev/shot.mjs --m <module>[,<other>] --out shots/<module>/v1.png --cam 0,1.55,13.5 --target 0,2.6,0 --t 2
```

Flags: `--t <s>` pre-simulates updates; `--grid` shows a ground grid/axes; `--post` renders through `src/fx/post.js` once it
exists; `--opts '{"<module>":{...}}'` passes options; `--w/--h` viewport; `--page /` screenshots the real site.
The tool prints draw calls/triangles and any console errors. **Look at your screenshots** (Read the PNG) from all four
views and iterate until it genuinely looks great — composition, silhouette, colour, scale relative to the layout.
Zero console errors is a requirement.
