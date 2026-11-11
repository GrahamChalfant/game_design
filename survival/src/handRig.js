import * as THREE from 'three';

// Your hands' fingers in the first-person view (fp-hands.glb, from blender/fp_hands.py): each
// finger and the thumb in three rigid segments, bent at the knuckles, so a hand can close round
// what it holds. A grip says how far each knuckle is bent (radians, toward the palm), knuckle to
// tip; the thumb's first number swings it round toward the fingers (opposing them), the rest
// curl it down across them, root to tip.
// A hand eases from one grip to the next.
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const all = (bends) => Object.fromEntries(FINGERS.map((f) => [f, bends]));

export const GRIPS = {
  // Hanging loose, a little curled.
  relaxed: { ...all([0.45, 0.55, 0.3]), pinky: [0.55, 0.6, 0.35], thumb: [0.25, 0.05, 0.15, 0.15] },
  // Open, fingers nearly straight (letting go of the string, reaching into water).
  open: { ...all([0.1, 0.12, 0.08]), thumb: [0, -0.15, 0, 0] },
  // Closed round a handle (the axe, the knife, the torch, the bow's grip): the fingers wrapped
  // round it, the thumb across them.
  // (Fitted in Blender round a 32 mm handle: closed on it, not through it.)
  handle: { ...all([1.15, 1.4, 0.85]), ring: [1.18, 1.42, 0.85], pinky: [1.25, 1.45, 0.9], thumb: [0.4, 0.35, 0.55, 0.45] },
  // Round the bow's grip, as an archer holds it: the riser pressed into the heel of the thumb, the
  // fingers curled loosely round the front of it (not clenched: a tight fist twists the bow), the
  // thumb along the near side, pointing ahead.
  bow: { index: [0.95, 1.2, 0.7], middle: [1.05, 1.3, 0.75], ring: [1.1, 1.35, 0.8], pinky: [1.2, 1.4, 0.85], thumb: [0.55, 0.35, 0.45, 0.35] },
  // Round the lighter: the fingers wrapped round its body, the thumb up on the wheel.
  lighter: { ...all([1.2, 1.5, 0.95]), thumb: [0.35, -0.1, 0.35, 0.3] },
  // A match between the thumb and the tip of the index finger, the others tucked away.
  pinch: { index: [0.95, 0.85, 0.35], middle: [1.15, 1.35, 0.85], ring: [1.25, 1.45, 0.9], pinky: [1.3, 1.5, 0.9], thumb: [0.6, 0, 0.2, 0.2] },
  // A box held flat between the fingers and the thumb.
  box: { ...all([0.75, 0.55, 0.3]), pinky: [0.85, 0.65, 0.4], thumb: [0.35, 0.05, 0.1, 0.1] },
  // Round something big (the flask, a piece of meat).
  wide: { ...all([0.85, 0.95, 0.6]), pinky: [0.95, 1.0, 0.65], thumb: [0.35, 0.2, 0.3, 0.3] },
  // Cupped (scooping water, holding berries in the palm).
  cup: { ...all([0.35, 0.4, 0.3]), pinky: [0.45, 0.45, 0.3], thumb: [0.1, 0, 0.1, 0.1] },
  // Cupped to scoop water: the fingers together and only a little bent, the thumb alongside.
  scoop: { ...all([0.2, 0.25, 0.15]), pinky: [0.25, 0.3, 0.2], thumb: [0.15, -0.05, 0.05, 0.05] },
  // Three fingers hooked round the bow string, the little finger and thumb tucked in.
  string: { index: [0.3, 1.35, 0.6], middle: [0.3, 1.4, 0.65], ring: [0.35, 1.35, 0.6], pinky: [1.2, 1.4, 0.9], thumb: [0.5, 0.6, 0.7, 0.5] },
  // Rummaging: fingers half-bent, reaching.
  claw: { ...all([0.55, 0.85, 0.55]), thumb: [0.2, 0.2, 0.4, 0.4] },
};

// Where a handle passes through the hand closed in the `handle` grip (the hand model's own space):
// the hand's placed so that's at its origin, as the things it holds expect.
export const GRIP_CENTRE = new THREE.Vector3(-0.028, 0, -0.024);

export class HandRig {
  // `root`: the hand's part tree (fp-r-hand or fp-l-hand); `side`: 1 for the right, -1 the left.
  constructor(root, side) {
    this.root = root;
    this.side = side;
    const s = side > 0 ? 'r' : 'l';
    this.parts = {};
    for (const name of [...FINGERS, 'thumb']) {
      this.parts[name] = [1, 2, 3].map((k) => {
        const part = root.getObjectByName(`fp-${s}-${name}-${k}`);
        return { part, rest: part.quaternion.clone() };
      });
    }
    this.now = structuredClone(GRIPS.relaxed);
    this.want = GRIPS.relaxed;
    this.extra = null; // set each frame for a moment's move on top of the grip, e.g. the thumb flicking
  }

  // The grip to ease into (a name from GRIPS, or a grip of its own).
  grip(grip) {
    this.want = typeof grip === 'string' ? GRIPS[grip] : grip;
  }

  // Eases toward the grip (straight there if `snap`) and bends the fingers to match.
  update(dt, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 18);
    const turn = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const X = new THREE.Vector3(1, 0, 0);
    for (const [name, segments] of Object.entries(this.parts)) {
      const now = this.now[name];
      const want = this.want[name];
      for (let i = 0; i < now.length; i++) now[i] += (want[i] - now[i]) * k;
      const bends = this.extra?.[name] ? now.map((v, i) => v + (this.extra[name][i] ?? 0)) : now;
      // (The left hand's a mirror image: turns round y go the other way; round x, the same.)
      segments.forEach(({ part, rest }, i) => {
        part.quaternion.copy(rest);
        if (name !== 'thumb') {
          part.quaternion.multiply(turn.setFromAxisAngle(Y, this.side * bends[i]));
          return;
        }
        if (i === 0) part.quaternion.multiply(turn.setFromAxisAngle(Y, this.side * bends[0]));
        part.quaternion.multiply(turn.setFromAxisAngle(X, -bends[i + 1]));
      });
    }
    this.extra = null;
  }
}
