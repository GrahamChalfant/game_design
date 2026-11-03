import * as THREE from 'three';

// What the player can wear over their red coat (#88), and how it looks on them. How warm
// each one keeps you is in survival.js (OUTFIT_WARMTH).
export const OUTFITS = {
  // A heavy coat of stitched hides: the colour its body takes on.
  parka: { color: 0x8a6a4a },
};

// The red coat is painted in player.glb's vertex colours: strong red, very little green.
const isCoat = (r, g) => r > 0.12 && r > g * 4;
const COAT_RED = 0.4; // the coat's usual brightness (linear), so darker folds stay darker

// Paints the coat on a loaded player model to match `outfit` (or back to red for null).
// Safe to call every frame: it only repaints when the outfit changes.
export function dressModel(model, outfit) {
  if (!model || model.userData.outfit === outfit) return;
  model.userData.outfit = outfit;
  const target = outfit ? new THREE.Color(OUTFITS[outfit].color) : null; // (linear, like the vertex colours)
  model.traverse((child) => {
    const colors = child.isMesh ? child.geometry.attributes.color : null;
    if (!colors) return;
    // Keep the original colours, so the red coat can come back for a new game.
    child.userData.coatColors ??= colors.array.slice();
    const original = child.userData.coatColors;
    for (let i = 0; i < colors.count; i++) {
      const [r, g, b] = [original[i * 3], original[i * 3 + 1], original[i * 3 + 2]];
      if (!target || !isCoat(r, g)) colors.setXYZ(i, r, g, b);
      else {
        const shade = r / COAT_RED;
        colors.setXYZ(i, target.r * shade, target.g * shade, target.b * shade);
      }
    }
    colors.needsUpdate = true;
  });
}
