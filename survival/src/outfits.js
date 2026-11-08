import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// What the player can wear (#88), and how it looks on them. How warm each one keeps you is in
// survival.js (OUTFIT_WARMTH). player.glb is modelled in the red jacket; with no outfit on,
// the jacket is painted as a plain shirt instead.
export const OUTFITS = {
  shirt: { color: 0x4a5560 }, // (linear) a thin grey-blue shirt
  jacket: { color: null }, // the red jacket, as modelled
  // A heavy coat of stitched hides, down to the knees, with a fur-trimmed hood: the colour
  // its body takes on, and its fur.
  parka: { color: 0x8a6a4a, fur: [0xd8c49a, 0xc2a878, 0xe6d6b0] },
};

// The red coat is painted in player.glb's vertex colours: strong red, very little green or
// blue, however shaded (its creases are darkened: survivor.py's baked shading), so it's told
// apart by how red it is, not how bright. (Skin, lips and the beard are much less red.)
const isCoat = (r, g, b) => r > 0.008 && r > g * 3.5 && r > b * 3.5;
const COAT_RED = 0.4; // the coat's usual brightness (linear), so darker folds stay darker

// Paints the coat on a loaded player model to match `outfit` (null: just the shirt).
// Safe to call every frame: it only repaints when the outfit changes.
export function dressModel(model, outfit) {
  if (!model || model.userData.outfit === outfit) return;
  model.userData.outfit = outfit;
  showParkaParts(model, outfit === 'parka');
  const { color } = OUTFITS[outfit ?? 'shirt'];
  const target = color === null ? null : new THREE.Color(color); // (linear, like the vertex colours)
  model.traverse((child) => {
    if (child.userData.parkaPart || child.userData.keepColours) return; // the parka's own pieces (and a torch's flame) keep their colours
    const colors = child.isMesh ? child.geometry.attributes.color : null;
    if (!colors) return;
    // Keep the original colours, so the red jacket can come back when it's put on.
    child.userData.coatColors ??= colors.array.slice();
    const original = child.userData.coatColors;
    for (let i = 0; i < colors.count; i++) {
      const [r, g, b] = [original[i * 3], original[i * 3 + 1], original[i * 3 + 2]];
      if (!target || !isCoat(r, g, b)) colors.setXYZ(i, r, g, b);
      else {
        const shade = r / COAT_RED;
        colors.setXYZ(i, target.r * shade, target.g * shade, target.b * shade);
      }
    }
    colors.needsUpdate = true;
  });
}

// The parka's own pieces, added to player.glb the first time it's worn: a skirt down to
// mid-thigh that follows the legs, and a hood with a fur ruff round the face that follows the head.
// Sizes are in player.glb's own space (meters, standing at the origin, facing +z), fitted to
// the survivor (blender/survivor.py): the skirt just over the jacket's hem, the hood just over
// the beanie. Smooth shaded; the fur is a soft, lumpy roll, lighter at its tips.
const SKIRT = { top: 0.95, bottom: 0.66, width: [0.2, 0.226], depth: [0.142, 0.166], forward: 0.0 }; // (to mid-thigh: longer, and a stride pushes the knee through it)
const HOOD = { centre: [0, 1.68, -0.012], size: [0.128, 0.158, 0.138], open: THREE.MathUtils.degToRad(150), down: 0.74 };
const FUR = { ruff: 0.034, hem: 0.03 };

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
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const bone = (name) => body.skeleton.bones.findIndex((b) => b.name === name);
  const bones = { hips: bone('hips'), left: bone('thigh_L'), right: bone('thigh_R'), head: bone('head') };

  // Work in the rest pose, so the pieces line up with the body as it was modelled.
  body.skeleton.pose();
  model.updateMatrixWorld(true);

  // The skirt: a gently flared tube over the hips, darker toward its hem; a fur roll round it.
  const tube = new THREE.CylinderGeometry(1, 1, 1, 40, 8, true);
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
  const base = new THREE.Color(color);
  paint(tube, (x, y) => base.clone().multiplyScalar(0.85 + 0.15 * (y - SKIRT.bottom) / (SKIRT.top - SKIRT.bottom)));
  tube.computeVertexNormals();
  const hemPath = (t) => new THREE.Vector3(Math.cos(t) * (SKIRT.width[1] + 0.008), SKIRT.bottom + 0.012, Math.sin(t) * (SKIRT.depth[1] + 0.008) + SKIRT.forward);
  const hem = furRoll(Array.from({ length: 40 }, (_, i) => hemPath((i / 40) * Math.PI * 2)), true, FUR.hem, fur);
  const skirtGeometry = mergeGeometries([tube.toNonIndexed(), hem.toNonIndexed()]);
  skinToLegs(skirtGeometry, bones);
  const skirt = new THREE.SkinnedMesh(skirtGeometry, material);
  skirt.position.copy(body.position);
  skirt.quaternion.copy(body.quaternion);
  skirt.scale.copy(body.scale);
  body.parent.add(skirt);
  skirt.bind(body.skeleton, body.bindMatrix);

  // The hood: a shell round the back, top and sides of the head, open at the face, and a fur
  // ruff following the edge of the opening.
  const [sx, sy, sz] = HOOD.size;
  const [cx, cy, cz] = HOOD.centre;
  const phiStart = Math.PI / 2 + HOOD.open / 2;
  const shell = new THREE.SphereGeometry(1, 36, 18, phiStart, Math.PI * 2 - HOOD.open, 0, Math.PI * HOOD.down).scale(sx, sy, sz).translate(cx, cy, cz);
  paint(shell, () => base);
  shell.computeVertexNormals();
  const rim = (theta, phi) => new THREE.Vector3(-Math.cos(phi) * Math.sin(theta) * sx + cx, Math.cos(theta) * sy + cy, Math.sin(phi) * Math.sin(theta) * sz + cz);
  const edge = [];
  const bottom = Math.PI * HOOD.down;
  for (let i = 0; i <= 16; i++) edge.push(rim(bottom - (bottom - 0.05) * (i / 16), phiStart)); // (up the left of the opening)
  for (let i = 1; i <= 16; i++) edge.push(rim(0.05 + (bottom - 0.05) * (i / 16), phiStart + Math.PI * 2 - HOOD.open)); // (and down the right)
  const ruff = furRoll(edge, false, FUR.ruff, fur);
  const hood = new THREE.Mesh(mergeGeometries([shell.toNonIndexed(), ruff.toNonIndexed()]), material);
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

// A roll of fur along `points` (closed into a ring if `closed`): a tube `radius` thick, made
// lumpy and tufted, its colours mixed from `colors` and lighter at the tips of the tufts.
function furRoll(points, closed, radius, colors) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  const geometry = new THREE.TubeGeometry(curve, points.length * 3, radius, 12, closed);
  const position = geometry.attributes.position;
  const centre = new THREE.Vector3();
  const p = new THREE.Vector3();
  const shades = colors.map((c) => new THREE.Color(c));
  const colorList = [];
  const segments = 12 + 1;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const along = Math.floor(i / segments) / (points.length * 3);
    curve.getPointAt(Math.min(1, along), centre);
    const out = p.clone().sub(centre);
    // (Tufts: bumps along and round the roll.)
    const tuft = THREE.MathUtils.clamp(0.5 + 0.35 * Math.sin(along * 190 + Math.atan2(out.y, out.x) * 3 + Math.sin(along * 23) * 4) + 0.3 * Math.sin(along * 113 + out.z * 60) * Math.sin(along * 41 + 2.1), 0, 1);
    const lump = 0.75 + 0.55 * tuft;
    p.copy(centre).addScaledVector(out, lump);
    position.setXYZ(i, p.x, p.y, p.z);
    const c = shades[0].clone().lerp(shades[1], 0.5 + 0.5 * Math.sin(along * 37)).lerp(shades[2], tuft * 0.6);
    c.multiplyScalar(0.8 + 0.25 * tuft);
    colorList.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorList, 3));
  geometry.computeVertexNormals();
  return geometry;
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
    const legs = 0.95 * Math.min(1, down * 1.4) ** 1.5; // how much the legs (rather than the hips) move it
    const side = THREE.MathUtils.clamp(position.getX(i) / 0.07, -1, 1); // +x is the left leg
    const toLeft = legs * (0.5 + 0.5 * side);
    const toRight = legs * (0.5 - 0.5 * side);
    indices.push(hips, left, right, 0);
    weights.push(1 - toLeft - toRight, toLeft, toRight, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}
