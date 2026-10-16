/**
 * Film grain overlay. Paints one tile of per-pixel noise to a canvas and hands it to CSS as --grain-image;
 * the stepped jitter animation and the strength/blend tokens (--grain-strength, --grain-blend) live in overlay.css.
 *
 *   initGrain(el, { size = 180 }) => void
 */
export function initGrain(el, { size = 180 } = {}) {
  if (!el) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    // Bias toward mid-grey with occasional bright/dark specks: reads as silver grain, not TV static.
    const r = Math.random();
    const v = 128 + (r - 0.5) * 2 * 128 * Math.abs(r - 0.5) * 2;
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v + (Math.random() - 0.5) * 70));
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  el.style.setProperty('--grain-image', `url(${canvas.toDataURL('image/png')})`);
}
