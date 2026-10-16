/*
 * Converts public/fonts/PirataOne-Regular.ttf (SIL OFL 1.1) into the typeface JSON that
 * three's FontLoader reads, written to public/fonts/pirata-one.typeface.json.
 *
 *   node scripts/build-font.mjs [--in <font.ttf>] [--out <typeface.json>]
 *
 * Output format (what FontLoader / Font.createPath consume):
 *   resolution          font units per em. Coordinates are written in raw font units, so
 *                       TextGeometry's `size` equals the em size in world units
 *                       (cap height = capHeight / resolution * size).
 *   glyphs[char]        { ha: advance, x_min, x_max, o: outline }
 *   o                   space-separated commands, y up:
 *                         m x y            moveTo
 *                         l x y            lineTo
 *                         q x y cx cy      quadratic: END point first, then the control point
 *                         b x y c1x c1y c2x c2y   cubic: END point first, then both controls
 *   ascender, descender, underlinePosition, underlineThickness, boundingBox, familyName
 * Extras ignored by FontLoader but used by src/world/name.js:
 *   kerning["AB"]       GPOS pair adjustment in font units (add to A's advance before B)
 *   capHeight, xHeight  from the OS/2 table
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as opentypeModule from 'opentype.js';

// The package's Node entry is a UMD bundle, so the API may sit on `default`.
const opentype = opentypeModule.parse ? opentypeModule : opentypeModule.default;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : fallback;
};
const input = arg('in', resolve(root, 'public/fonts/PirataOne-Regular.ttf'));
const output = arg('out', resolve(root, 'public/fonts/pirata-one.typeface.json'));

const buffer = readFileSync(input);
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

// One decimal keeps TrueType half-unit points exact without bloating the file.
const num = (v) => String(Math.round(v * 10) / 10);

/** Serialises an opentype.js path (font units, y up) into FontLoader's outline string. */
function outline(commands) {
  const out = [];
  let start = null;
  let cur = null;
  const same = (a, x, y) => a && Math.abs(a.x - x) < 1e-6 && Math.abs(a.y - y) < 1e-6;

  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    switch (c.type) {
      case 'M':
        out.push('m', num(c.x), num(c.y));
        start = cur = { x: c.x, y: c.y };
        break;
      case 'L': {
        // Zero-length segments and the explicit return to the contour start add
        // degenerate side walls to the extrusion; the contour closes implicitly.
        const next = commands[i + 1];
        const closing = (!next || next.type === 'Z' || next.type === 'M') && same(start, c.x, c.y);
        if (same(cur, c.x, c.y) || closing) break;
        out.push('l', num(c.x), num(c.y));
        cur = { x: c.x, y: c.y };
        break;
      }
      case 'Q':
        out.push('q', num(c.x), num(c.y), num(c.x1), num(c.y1));
        cur = { x: c.x, y: c.y };
        break;
      case 'C':
        out.push('b', num(c.x), num(c.y), num(c.x1), num(c.y1), num(c.x2), num(c.y2));
        cur = { x: c.x, y: c.y };
        break;
      case 'Z':
        cur = start;
        break;
    }
  }
  return out.join(' ');
}

const chars = [];
for (let code = 32; code < 127; code++) chars.push(String.fromCharCode(code));

const glyphs = {};
for (const char of chars) {
  const glyph = font.charToGlyph(char);
  if (!glyph || glyph.index === 0) continue; // .notdef: FontLoader falls back to '?'
  const bounds = glyph.getBoundingBox();
  glyphs[char] = {
    ha: Math.round(glyph.advanceWidth),
    x_min: Math.round(bounds.x1),
    x_max: Math.round(bounds.x2),
    o: outline(glyph.path.commands),
  };
}

// Bake GPOS pair kerning for every printable pair (FontLoader itself never kerns).
const kerning = {};
const tables = font.position.getKerningTables('latn') ?? font.position.getKerningTables('DFLT');
for (const left of chars) {
  for (const right of chars) {
    const l = font.charToGlyph(left);
    const r = font.charToGlyph(right);
    const value = tables ? font.position.getKerningValue(tables, l.index, r.index) : font.getKerningValue(l, r);
    if (value) kerning[left + right] = value;
  }
}

const { head, post, os2 } = font.tables;
const name = (key) => font.names.windows?.[key]?.en ?? font.names.macintosh?.[key]?.en ?? '';

const json = {
  familyName: name('fontFamily'),
  resolution: font.unitsPerEm,
  ascender: Math.round(font.ascender),
  descender: Math.round(font.descender),
  capHeight: os2?.sCapHeight ?? Math.round(font.ascender * 0.7),
  xHeight: os2?.sxHeight ?? Math.round(font.ascender * 0.5),
  underlinePosition: Math.round(post.underlinePosition),
  underlineThickness: Math.round(post.underlineThickness),
  boundingBox: { xMin: head.xMin, yMin: head.yMin, xMax: head.xMax, yMax: head.yMax },
  cssFontWeight: 'normal',
  cssFontStyle: 'normal',
  original_font_information: {
    copyright: name('copyright'),
    license: name('license'),
    licenseURL: name('licenseURL'),
    version: name('version'),
  },
  kerning,
  glyphs,
};

writeFileSync(output, JSON.stringify(json));
console.log(
  `wrote ${output}: ${Object.keys(glyphs).length} glyphs, ${Object.keys(kerning).length} kerning pairs, ` +
    `${(JSON.stringify(json).length / 1024).toFixed(1)} KB`,
);
