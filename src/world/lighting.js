import * as THREE from 'three';

/**
 * Shared night lighting rig + fog. Every world module is authored against this.
 *
 * API: { object, hemi, moonLight, fill, setBlood(t) }
 *   setBlood(0..1) shifts the moonlight from pale to blood red (driven by the intro).
 */
export default function createLighting({ scene, palette }) {
  const group = new THREE.Group();
  group.name = 'lighting';

  scene.fog = new THREE.FogExp2(palette.fog, 0.028);

  // Cool sky / dark ground ambient.
  const hemi = new THREE.HemisphereLight('#7f9bb8', palette.earth, 1.1);
  group.add(hemi);

  // Moon key light from behind the gate: rims everything facing the camera.
  const moonLight = new THREE.DirectionalLight(palette.red, 2.0);
  moonLight.position.set(0, 7, -40); // low, so it rims silhouettes instead of flooding the ground
  group.add(moonLight, moonLight.target);

  // Softened royal-blue fill from the front-left so faces toward camera aren't pure black.
  const fill = new THREE.DirectionalLight(new THREE.Color(palette.royal).lerp(new THREE.Color(palette.sand), 0.35), 1.3);
  fill.position.set(-12, 6, 18);
  group.add(fill, fill.target);

  const pale = new THREE.Color(palette.sand);
  const blood = new THREE.Color(palette.red);

  return {
    object: group,
    hemi,
    moonLight,
    fill,
    setBlood(t) {
      moonLight.color.copy(pale).lerp(blood, t);
    },
  };
}
