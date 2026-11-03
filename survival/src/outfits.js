import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// What the player can wear over their red coat (#88), and how it looks on them. How warm
// each one keeps you is in survival.js (OUTFIT_WARMTH).
export const OUTFITS = {
  // A heavy coat of stitched hides, down to the knees, with a fur-trimmed hood: the colour
  // its body takes on, and its fur.
  parka: { color: 0x8a6a4a, fur: [0xd8c49a, 0xc2a878, 0xe6d6b0] },
};

// The red coat is painted in player.glb's vertex colours: strong red, very little green.
const isCoat = (r, g) => r > 0.12 && r > g * 4;
const COAT_RED = 0.4; // the coat's usual brightness (linear), so darker folds stay darker

// Paints the coat on a loaded player model to match `outfit` (or back to red for null).
// Safe to call every frame: it only repaints when the outfit changes.
export function dressModel(model, outfit) {
  if (!model || model.userData.outfit === outfit) return;
  model.userData.outfit = outfit;
  showParkaParts(model, outfit === 'parka');
  const target = outfit ? new THREE.Color(OUTFITS[outfit].color) : null; // (linear, like the vertex colours)
  model.traverse((child) => {
    if (child.userData.parkaPart) return; // the parka's own pieces keep their colours
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

// The parka's own pieces, added to player.glb the first time it's worn: a skirt down to the
// knees that follows the legs, and a hood with a fur ruff that follows the head.
// Sizes are in player.glb's own space (meters, standing at the origin, facing +z).
const SKIRT = { top: 0.97, bottom: 0.47, width: [0.27, 0.34], depth: [0.235, 0.28], forward: 0.02 };
const HOOD = { centre: [0, 1.62, -0.01], radius: 0.255, face: [0, 1.6, 0.17], ruff: [0.2, 0.23] };

function showParkaParts(model, show) {
  if (show && !model.userData.parkaParts) model.userData.parkaParts = addParkaParts(model);
  for (const part of model.userData.parkaParts ?? []) part.visible = show;
}

function addParkaParts(model) {
  let body = null;
  model.traverse((child) => {
    if (child.isSkinnedMesh && !body && child.name !== 'player-pack') body = child;
  });
  if (!body) return []; // (the stand-in shown until player.glb loads has no skeleton)
  const { color, fur } = OUTFITS.parka;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  const bone = (name) => body.skeleton.bones.findIndex((b) => b.name === name);
  const bones = { hips: bone('hips'), left: bone('thigh_L'), right: bone('thigh_R'), head: bone('head') };

  // Work in the rest pose, so the pieces line up with the body as it was modelled.
  body.skeleton.pose();
  model.updateMatrixWorld(true);

  // The skirt: a flared tube, then a ring of fur round its hem.
  const tube = new THREE.CylinderGeometry(1, 1, 1, 18, 5, true);
  const position = tube.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const down = 0.5 - position.getY(i); // 0 at the top, 1 at the hem
    position.setXYZ(
      i,
      position.getX(i) * THREE.MathUtils.lerp(...SKIRT.width, down),
      THREE.MathUtils.lerp(SKIRT.top, SKIRT.bottom, down),
      position.getZ(i) * THREE.MathUtils.lerp(...SKIRT.depth, down) + SKIRT.forward,
    );
  }
  paint(tube, () => color);
  const hem = furRing(20, SKIRT.bottom + 0.02, SKIRT.width[1] + 0.01, SKIRT.depth[1] + 0.01, 0.055, fur, 'y');
  const skirtGeometry = mergeGeometries([tube.toNonIndexed(), hem]);
  skinToLegs(skirtGeometry, bones);
  const skirt = new THREE.SkinnedMesh(skirtGeometry, material);
  skirt.position.copy(body.position);
  skirt.quaternion.copy(body.quaternion);
  skirt.scale.copy(body.scale);
  body.parent.add(skirt);
  skirt.bind(body.skeleton, body.bindMatrix);

  // The hood: a shell round the back and sides of the head, open at the face, with a thick
  // ruff of fur framing the face.
  const OPEN = THREE.MathUtils.degToRad(120); // how wide the face opening is
  const shell = new THREE.SphereGeometry(HOOD.radius, 14, 9, Math.PI / 2 + OPEN / 2, Math.PI * 2 - OPEN, 0, Math.PI * 0.72)
    .scale(1, 1.05, 1.1)
    .translate(...HOOD.centre);
  paint(shell, () => color);
  const ruff = furRing(22, 0, ...HOOD.ruff, 0.07, fur, 'z').translate(...HOOD.face);
  const hood = new THREE.Mesh(mergeGeometries([shell.toNonIndexed(), ruff]), material);
  // Place it on the body, then hang it from the head bone so it turns and bobs with the head.
  body.updateMatrixWorld(true);
  hood.applyMatrix4(body.matrixWorld);
  model.add(hood);
  hood.applyMatrix4(model.matrixWorld.clone().invert());
  body.skeleton.bones[bones.head].attach(hood);

  for (const part of [skirt, hood]) {
    part.userData.parkaPart = true;
    part.castShadow = true;
    part.frustumCulled = false;
  }
  return [skirt, hood];
}

// A ring of lumpy fur blobs round an ellipse (half-widths a, b) in the plane facing `axis`
// ('y': lying flat at height `at`; 'z': standing up, facing forward, centred on the origin).
function furRing(count, at, a, b, size, colors, axis) {
  const blobs = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = size * (0.8 + 0.4 * Math.abs(Math.sin(i * 7.7)));
    const blob = new THREE.IcosahedronGeometry(r, 0).rotateY(i * 1.3).rotateX(i * 0.7);
    if (axis === 'y') blob.translate(Math.cos(angle) * a, at, Math.sin(angle) * b);
    else blob.translate(Math.cos(angle) * a, Math.sin(angle) * b, Math.abs(Math.sin(angle)) * -0.02);
    const shade = colors[i % colors.length];
    paint(blob, () => shade);
    blobs.push(blob);
  }
  return mergeGeometries(blobs);
}

// Gives every vertex of `geometry` one colour.
function paint(geometry, colorAt) {
  const color = new THREE.Color();
  const colors = [];
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    color.set(colorAt(position.getX(i), position.getY(i), position.getZ(i)));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// Skins the skirt: the waist moves with the hips, and lower down each side follows more and
// more of its own thigh, so the hem swings with the legs instead of the legs poking through.
function skinToLegs(geometry, { hips, left, right }) {
  const position = geometry.attributes.position;
  const indices = [];
  const weights = [];
  for (let i = 0; i < position.count; i++) {
    const down = THREE.MathUtils.clamp((SKIRT.top - position.getY(i)) / (SKIRT.top - SKIRT.bottom), 0, 1);
    const legs = 0.8 * down * down; // how much the legs (rather than the hips) move it
    const side = THREE.MathUtils.clamp(position.getX(i) / 0.12, -1, 1); // +x is the left leg
    const toLeft = legs * (0.5 + 0.5 * side);
    const toRight = legs * (0.5 - 0.5 * side);
    indices.push(hips, left, right, 0);
    weights.push(1 - toLeft - toRight, toLeft, toRight, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}
