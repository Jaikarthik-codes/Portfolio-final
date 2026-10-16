/**
 * Procedural ensō (zen brush circle) for the preloader.
 *
 *   ensoPaths(opts?) => { body, spine, streaks }
 *     body    — closed path: the filled brush stroke (pressed start, swelling body, dry tapering tail)
 *     spine   — open centre-line path in stroke order; stroked with a dash it reveals `body` as progress
 *     streaks — [{ d, width, dash }] thin dry-brush gaps (kasure) to knock out of the tail
 *   All coordinates are in a `size`×`size` viewBox (default 400). Deterministic for a given seed.
 */

const TAU = Math.PI * 2;
const round = (n) => Math.round(n * 10) / 10;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1D noise in −1..1: a few detuned sines with random phases. Plenty for a hand wobble.
function wave(rand, frequency) {
  const terms = [1, 2.3, 4.9].map((f, i) => ({ f: f * frequency * (0.85 + rand() * 0.3), p: rand() * TAU, a: 1 / (i + 1) }));
  const norm = terms.reduce((sum, k) => sum + k.a, 0);
  return (t) => terms.reduce((sum, k) => sum + Math.sin(t * k.f * TAU + k.p) * k.a, 0) / norm;
}

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const toPath = (points, close) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join('') + (close ? 'Z' : '');

export function ensoPaths({
  size = 400,
  radius = 150,
  width = 30,
  start = 116, // degrees, screen space (y down): lower-left, where the brush lands
  sweep = 330, // clockwise travel; the remaining gap is the ensō's open mouth
  seed = 23,
  samples = 240,
} = {}) {
  const rand = mulberry32(seed);
  const c = size / 2;
  const a0 = (start / 360) * TAU;
  const span = (sweep / 360) * TAU;

  const wobble = wave(rand, 1.1);
  const edgeOuter = wave(rand, 6);
  const edgeInner = wave(rand, 7);
  const pressure = wave(rand, 2.2);

  // Brush pressure along the stroke: a pressed landing, full body, then a long dry taper.
  const profile = (t) =>
    (1 + 0.28 * (1 - smoothstep(0, 0.07, t))) * (1 - 0.93 * smoothstep(0.46, 1, t)) * (1 + 0.08 * pressure(t));

  // Point at stroke position t, offset across the stroke (+ = outward).
  const frame = (t) => {
    const a = a0 + span * t;
    const r = radius * (1 + 0.018 * wobble(t)) - radius * 0.04 * t * t; // drifts inward: a slight spiral close
    const radial = [Math.cos(a), Math.sin(a)];
    const tangent = [-Math.sin(a), Math.cos(a)]; // direction of travel (clockwise on screen)
    return { centre: [c + radial[0] * r, c + radial[1] * r], radial, tangent };
  };
  const offset = ({ centre, radial }, d) => [centre[0] + radial[0] * d, centre[1] + radial[1] * d];

  const outer = [];
  const inner = [];
  const spine = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const f = frame(t);
    const half = (width * profile(t)) / 2;
    outer.push(offset(f, half * (1 + 0.12 * edgeOuter(t))));
    inner.push(offset(f, -half * (1 - 0.1 * edgeInner(t))));
    spine.push(f.centre);
  }

  // Caps: a rounded, slightly elongated landing blob and a short pointed lift-off.
  const cap = (t, sign, stretch) => {
    const f = frame(t);
    const half = (width * profile(t)) / 2;
    const pts = [];
    for (let k = 1; k < 12; k++) {
      const phi = (k / 12) * Math.PI;
      const r = Math.cos(phi) * half * sign;
      const along = Math.sin(phi) * half * stretch * sign;
      pts.push([
        f.centre[0] + f.radial[0] * r + f.tangent[0] * along,
        f.centre[1] + f.radial[1] * r + f.tangent[1] * along,
      ]);
    }
    return pts;
  };
  const endCap = cap(1, 1, 3); // outer → forward → inner: a fine lift-off point
  const startCap = cap(0, -1, 1.25); // inner → backward → outer
  const outline = [...outer, ...endCap, ...inner.reverse(), ...startCap];

  // The spiral close and wobble pull the stroke off-centre; re-centre its bounding box in the viewBox.
  const xs = outline.map((pt) => pt[0]);
  const ys = outline.map((pt) => pt[1]);
  const dx = c - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = c - (Math.min(...ys) + Math.max(...ys)) / 2;
  const shift = (pts) => pts.map(([x, y]) => [x + dx, y + dy]);

  const body = toPath(shift(outline), true);

  // Kasure: bristle gaps that open up as the ink runs out toward the tail.
  const streaks = [];
  for (let k = 0; k < 11; k++) {
    const lane = -0.78 + (1.56 * (k + rand() * 0.6)) / 11;
    const from = 0.38 + rand() * 0.34;
    const pts = [];
    for (let i = Math.floor(from * samples); i <= samples * 0.97; i++) {
      const t = i / samples;
      const f = frame(t);
      pts.push(offset(f, (lane * width * profile(t)) / 2));
    }
    streaks.push({
      d: toPath(shift(pts), false),
      width: round(0.7 + rand() * 1.9),
      dash: `${Math.round(18 + rand() * 70)} ${Math.round(3 + rand() * 12)}`,
    });
  }

  return { body, spine: toPath(shift(spine), false), streaks };
}
