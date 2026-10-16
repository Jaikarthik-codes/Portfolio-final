import * as THREE from 'three';
import {
  BloomEffect,
  ChromaticAberrationEffect,
  Effect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  KernelSize,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

/** Split-tone grade (navy shadows, warm highlights) + `flash` (blood-red flash) + `fade` (to ink). */
class GradeEffect extends Effect {
  constructor(palette) {
    super(
      'GradeEffect',
      /* glsl */ `
      uniform float flash, fade;
      uniform vec3 flashColor, inkColor;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, c * vec3(0.86, 0.98, 1.14), (1.0 - smoothstep(0.0, 0.3, l)) * 0.6);
        c = mix(c, c * vec3(1.08, 0.97, 0.9), smoothstep(0.35, 1.0, l) * 0.5);
        c = mix(c, flashColor, flash * (0.55 + 0.45 * distance(uv, vec2(0.5))));
        c = mix(c, inkColor, fade);
        outputColor = vec4(c, inputColor.a);
      }`,
      {
        uniforms: new Map([
          ['flash', new THREE.Uniform(0)],
          ['fade', new THREE.Uniform(0)],
          ['flashColor', new THREE.Uniform(new THREE.Color(palette.red))],
          ['inkColor', new THREE.Uniform(new THREE.Color(palette.ink))],
        ]),
      },
    );
  }
}

/**
 * Post pipeline: god rays from the moon (high quality), bloom, ACES, grade, vignette, subtle chromatic aberration.
 * Film grain lives in the CSS overlay so it also covers the HTML UI.
 * API: { composer, render(delta), setSize(w, h), params } — params.{ bloom, flash, fade, vignette } are tweenable.
 */
export async function createPost({ renderer, scene, camera, palette, quality }, { mods = {} } = {}) {
  const high = quality === 'high';
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: high ? 4 : 0 });
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.78, luminanceSmoothing: 0.25, intensity: 0.95, radius: 0.72 });
  const grade = new GradeEffect(palette);
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.68 });
  const effects = [bloom, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), grade, vignette];

  const moon = mods.moon?.mesh;
  if (high && moon) {
    effects.unshift(
      new GodRaysEffect(camera, moon, {
        kernelSize: KernelSize.SMALL,
        density: 0.9,
        decay: 0.92,
        weight: 0.11,
        exposure: 0.3,
        samples: 50,
        clampMax: 1,
        resolutionScale: 0.5,
      }),
    );
  }
  composer.addPass(new EffectPass(camera, ...effects));
  composer.addPass(
    new EffectPass(camera, new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0009, 0.0006), radialModulation: true, modulationOffset: 0.3 })),
  );

  const uniform = (effect, name) => effect.uniforms.get(name);
  const params = {
    get bloom() { return bloom.intensity; },
    set bloom(v) { bloom.intensity = v; },
    get flash() { return uniform(grade, 'flash').value; },
    set flash(v) { uniform(grade, 'flash').value = v; },
    get fade() { return uniform(grade, 'fade').value; },
    set fade(v) { uniform(grade, 'fade').value = v; },
    get vignette() { return vignette.darkness; },
    set vignette(v) { vignette.darkness = v; },
  };

  return {
    composer,
    params,
    render(delta) {
      composer.render(delta);
    },
    setSize(width, height) {
      composer.setSize(width, height, false);
    },
  };
}
