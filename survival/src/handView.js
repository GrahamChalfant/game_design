import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';
import { LAND_TIME, REACH_TIME, SIP_TIME } from './player.js';
import { GRIP_CENTRE, HandRig } from './handRig.js';

// What you see of your own hands in the first-person view: your arms in their sleeves, in wool
// gloves with jointed fingers (fp-hands.glb, from blender/fp_hands.py, bent by handRig.js to close
// round what they hold), and whatever's in your hands: the axe,
// the knife or a torch in the right, the bow in the left (the right draws the string). They
// move as you chop, stab, draw the bow or walk; bandaging brings the left arm up too. The
// player's own model is hidden from the camera in this view (it would be all inside your
// head), so this stands in for it, fixed to the camera: x is right, y up and -z straight ahead,
// in meters. Each arm's origin is its hand's grip: what it holds runs up through the fist (+y).
const HAND = new THREE.Vector3(0.2, -0.205, -0.42); // where the right hand rests
// What you hold is drawn smaller than life (as if further off), so a 70 cm axe doesn't fill the
// view: the hands are close to your eyes, and full-size things that close loom far too big.
const HELD_SCALE = 0.62;
// How the bow's held (where the left hand is; how far the bow's top tips away from you, and
// leans over to the right, radians: negative leans it left): carried low and easy at your side,
// its top leaning out to the left; raised a little, ready, as you take an arrow and nock it; and
// up in front of you as you draw (to DRAW_GRIP), canted over to the left (BOW_AIM_CANT), away
// from the arrow, as an instinctive archer cants a bow away from the arrow's side: the arrow lies
// snug against the riser, and the string and the upper limb are out of your line of sight.
const BOW_CARRY = { at: new THREE.Vector3(-0.17, -0.27, -0.54), tip: 0.12, lean: -0.3 };
const BOW_READY = { at: new THREE.Vector3(-0.1, -0.16, -0.6), tip: 0.05, lean: -0.15 };
const BOW_AIM_CANT = -0.28;
// The bow arm, as an archer holds it: the forearm runs from the hand back toward your left
// shoulder (BOW_SHOULDER, in the view), so it comes in from the lower left nearly along your line
// of sight, pushing the bow toward what you aim at. The grip runs up through the fist, the hand
// closed round it: the back of the hand to the left of the bow, the fingers round its far side,
// their tips coming back into sight on its right, the thumb across the near side to meet them.
// The hand's turned a little about the grip, the palm facing right and a little ahead
// (BOW_TWIST), and tipped so the grip runs a little diagonally across the palm, the wrist low
// (BOW_PITCH): both so the wrist is bent back no further than an archer's is (30-40 degrees; turned
// much further, the forearm comes into the hand from the side).
const BOW_SHOULDER = new THREE.Vector3(-0.2, -0.45, 0);
const BOW_TWIST = 0.3; // radians the palm's turned from facing straight right toward the target
const BOW_PITCH = 0.35;
// How the hand's turned from the bow, then (in the bow's own space: the model's turned round, its
// string toward you). Always the same, however the bow's tipped or canted: the fingers are fitted
// round the grip as it lies in the hand this way (the 'bow' grip, handRig.js), touching it, not
// through it.
const BOW_HOLD = (() => {
  const up = new THREE.Vector3(0, 1, 0);
  const palm = new THREE.Vector3(Math.cos(BOW_TWIST), 0, -Math.sin(BOW_TWIST));
  const hand = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(palm, up, palm.clone().cross(up)));
  hand.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), BOW_PITCH));
  return new THREE.Quaternion().setFromAxisAngle(up, Math.PI).invert().multiply(hand);
})();
const BOW_TILT = -0.12; // the bow leans this far over (radians)
// The bow at full size: an adult's bow is 62–70 inches (about 1.6–1.8 m), near enough as tall as
// the archer, so held up at arm's length it runs off the top and bottom of the view. (bow.glb is
// 1.40 m long; the other tools are drawn smaller than life, HELD_SCALE, but a small bow looks a toy.)
const BOW_SCALE = 1.68 / 1.4;
const BRACE = 0.113 * BOW_SCALE; // how far the string stands back from the grip (bow.glb's, at that size)
const BOW_HALF = 0.7; // half bow.glb's length: its tips, where the string's tied
const DRAW_LENGTH = 0.36; // meters the string is drawn back at full draw, toward your chin (any further and it would be behind the camera)
// Shooting the bow, in steps (see animateBow):
//  - raise: the bow comes up and in, to the middle of the view;
//  - reach: the right hand comes up from below with an arrow and nocks it on the string, the
//    shaft laid on top of the bow hand (REACH: the first part of the draw);
//  - pull: the hand draws the string back to your chin, quickly at first, then slowing as the
//    bow gets heavier; held at full draw, the bow arm starts to tremble;
//  - release: the string snaps forward and quivers, the bow kicks in the hand, and the right
//    hand's fingers spring open as it slides back along your jaw, out of sight, then drops away.
// (Where the bow hand is at full draw: the arrow rest straight below the crosshair, about 9 cm
// under your eye, so the nock comes back to the corner of your mouth and the draw hand anchors
// under your jaw, mostly out of sight.)
const DRAW_GRIP = new THREE.Vector3(-0.013, -0.145, -0.62);
// Drawn and aimed, the arrow points at what's under the crosshair: its line runs from the nock
// through the arrow rest to the middle of the view, AIM_AT (in the view's space) at a usual
// shot's range, and that's the way it flies, from the rest (see bowCentre and arrows.fire).
const AIM_AT = new THREE.Vector3(0, 0, -25);
const ARROW_REST = new THREE.Vector3(0.024, 0.049, 0); // where the shaft lies, from the bow hand's grip: on the tip of the first finger, where it comes round the grip, against the right of the stave (the side toward you, the inside)
const REACH = 0.35; // the share of the draw spent bringing the arrow to the string
const HAND_OFF = new THREE.Vector3(0.24, -0.44, -0.3); // the right hand, out of sight below, while you hold the bow
// The right hand, from the nock, its fingers round the string: on the string at first, and at full
// draw under your jaw (below and right of the nock, mostly out of sight).
// Three fingers hooked round the string, the nock between the first and second: where that hook
// is from the hand's grip point (in the hand's own space).
// (In the first crease of the fingers, just inside their last joints: fitted to the 'string'
// grip, handRig.js.)
const HOOK = new THREE.Vector3(-0.003, 0.02, -0.031);
const CARRY = new THREE.Vector3(0, 0.01, 0.07); // the arrow's nock, from the right hand, as it brings the arrow up (in the fist, nock toward you)
// The draw hand on the string, as an archer's is: the string up through the first crease of
// three fingers (the nock between the first two), so the hand's up runs along the string: the
// palm toward your cheek, the back of the hand out to the right, the fingers reaching forward to
// the string; the little finger and thumb tucked in. Turned about the string so the wrist points
// back toward the elbow (DRAW_ELBOW: low and out to the right as it takes the string, in behind
// the arrow at the anchor), the forearm in line behind the hand. Tipped a little (DRAW_ROLL) so
// the back of the hand leans out, as the wrist sets (and less of it fills your view at the anchor).
const DRAW_ROLL = -0.12;
const DRAW_ELBOW = { start: new THREE.Vector3(0.34, -0.5, -0.06), anchor: new THREE.Vector3(0.2, -0.2, 0.3) };
const AT_REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, 0.3, -0.12));
const LET_GO = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, -0.25, 0.1)); // (after the shot, from how it was on the string: the wrist easing)
const FOLLOW_THROUGH = new THREE.Vector3(0.05, -0.01, 0.12); // (back along the jaw from the anchor, toward the ear)
const RELEASE = { snap: 0.07, quiver: 16, follow: 0.12, away: 0.5 }; // seconds: string settles, Hz, follow-through, hand drops away
const SWAY = 0.012; // how far the hand bobs as you walk
const TORCH_TILT = -0.25; // the torch leaning away from you (the wrist bent: it runs straight through the fist)
// The arm behind a hand (see reach): where each shoulder is, in the view (a little below, beside
// and behind your eyes), and how long the upper arm and the forearm are (meters, to the wrist).
// The elbow's wherever those put it for where the hand is, hanging down and a little out from
// your side; the forearm, in its sleeve, runs from there to the wrist. So an arm always comes up
// into view from where your own would: from below, off your shoulder, never from beside your head.
const SHOULDER = { right: new THREE.Vector3(0.19, -0.23, 0.04), left: new THREE.Vector3(-0.19, -0.23, 0.04) };
const UPPER_ARM = 0.3;
const FOREARM = 0.27;
// How far a wrist bends (radians): the fist tipped toward the thumb or the little finger (the
// knuckles forward, as a knife's point goes), and bent toward the palm or the back of the hand.
// Nothing asks for more than this: past it a wrist looks broken.
const WRIST_BENDS = { tilt: [-0.6, 0.35], flex: [-1.0, 1.1] };
// The knife in your hand: a fist round the handle, the forearm turned in a little (KNIFE.roll:
// 0 is thumb up, as to shake hands; a quarter turn more is palm down), the wrist tipped forward
// (tilt), the blade lying forward of square in the fist (KNIFE_SET), as a knife's held: between
// them they point it up and ahead, and no one of them has to do it all.
const KNIFE = { roll: 0.75, flex: 0.1, tilt: -0.45 };
const KNIFE_SET = -0.42;
const KNIFE_REST = new THREE.Vector3(0.2, -0.175, -0.44); // where the knife hand rests (a little higher than HAND: more of the forearm shows)
// A slash, as the hand goes ([how far through it, x, y, z, roll, flex, tilt]): drawn back up to
// the right, the wrist cocked back and the forearm turned out so the blade stands up; then cut
// across and down to the left, the arm reaching out through the middle of it, the forearm
// turning over to palm down and the wrist snapping forward, so the point sweeps over in an arc
// and the edge leads; and back to rest. The elbow follows the hand (reach).
const SLASH = [
  [0, KNIFE_REST.x, KNIFE_REST.y, KNIFE_REST.z, KNIFE.roll, KNIFE.flex, KNIFE.tilt],
  [0.26, 0.22, -0.08, -0.38, -0.55, -0.3, 0.2, (u) => easeOut(u)],
  [0.44, 0.13, -0.14, -0.52, 0.35, -0.05, -0.25, (u) => easeIn(u)],
  [0.6, -0.02, -0.225, -0.5, 1.3, 0.25, -0.55, (u) => linear(u)],
  [1, KNIFE_REST.x, KNIFE_REST.y, KNIFE_REST.z, KNIFE.roll, KNIFE.flex, KNIFE.tilt, (u) => smooth(u)],
];
// Butchering: the knife hand palm down over the carcass, the elbow out to the side as you lean
// over it, so the forearm comes in across from the lower right and the blade lies forward and
// across, into it.
const BUTCHER = { roll: 1.25, flex: 0.35, tilt: -0.6, out: 1.1, lift: -0.35 };
// The left hand flat, palm down (its palm is its +x), fingers ahead, the thumb in toward the middle.
const PALM_DOWN_LEFT = (() => {
  const palm = new THREE.Vector3(0, -1, 0);
  const thumbSide = new THREE.Vector3(1, 0, 0.15).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(palm, thumbSide, palm.clone().cross(thumbSide)));
})();
const NO_BEND = new THREE.Quaternion();
// Where each elbow is (in the view), for the forearms of hands busy in front of you: low and out
// to each side, a little ahead of your shoulders.
const ELBOW = { right: new THREE.Vector3(0.24, -0.46, -0.04), left: new THREE.Vector3(-0.24, -0.46, -0.04) };
// A bandage roll: about 5 cm across and 6 wide, held in the fingers ('roll' grip), its axis along
// the hand (where it sits, from the hand's grip point). Wound round the left forearm, over the
// sleeve: WRAP (in the left hand's space, back along the forearm), turn by turn as it goes on.
const ROLL = { radius: 0.024, width: 0.06, at: new THREE.Vector3(-0.012, 0, -0.006) };
const WRAP = { at: new THREE.Vector3(-0.041, -0.003, 0.17), radius: 0.063, turns: 5, pitch: 0.022 };
// Bandaging: where the left hand's held out (the forearm back from it to its elbow, raised into
// view), and the arc
// the right hand carries the roll over (radians round the forearm from its top: from its near
// side up over and down its far side).
const BANDAGE = { left: new THREE.Vector3(0.04, -0.08, -0.62), elbow: new THREE.Vector3(-0.2, -0.3, -0.3), rightElbow: new THREE.Vector3(0.3, -0.36, -0.34), arc: [-1.9, 1.0] };
const WRIST = new THREE.Vector3(0.003, 0, 0.065); // the wrist joint, in the hand model's space (the right's; the left's is mirrored)
const PALM_UP = -1.45; // how far the hand rolls over to hold something on its palm (radians, round the forearm)
const AXE_TILT = -0.55; // the axe's head tipped forward (the wrist bent: its handle runs straight through the fist)
const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const bendOf = (x) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), x);
const BREATH = 0.0025; // how far the hands rise and fall as you breathe
const LOOK_LAG = 0.012; // how far the hands trail behind as you turn your head (m per radian/s)
const EASE_IN = 16; // how quickly a hand settles into a new pose (1/s)
const SWAP = { lower: 0.14, raise: 0.22, depth: 0.32 }; // putting one thing away and taking out the next: seconds, and how far down
const L_OFF = new THREE.Vector3(-0.26, -0.46, -0.3); // the left hand, out of sight below
// What each selected item is, for which prop is in the hand (and whether changing between two
// is putting one thing away and taking out another).
const KIND = { litTorch: 'torch', cookedMeat: 'meat', rawMeat: 'meat', burntMeat: 'meat' };
const MEAT = { rawMeat: 0xd2605e, cookedMeat: 0x9a5a2e, burntMeat: 0x2e231d }; // (as on the spit, campfires.js)
const PROPS = ['lighter', 'matches', 'flask', 'meat', 'berries', 'bandage']; // shown in the right hand while selected
const SLEEVE = { shirt: 0x4a5560, jacket: 0x661411, parka: 0x8a6a4a }; // (linear, as in outfits.js)
const GLOVE = 0x3a3632;
const TOOLS = ['axe', 'knife', 'bow', 'torch', 'litTorch'];

export class HandView {
  constructor(camera, scene) {
    if (!camera.parent) scene.add(camera); // (the camera's children are only drawn if it's in the scene)
    this.group = new THREE.Group();
    this.group.visible = false;
    camera.add(this.group);
    this.camera = camera;
    this.time = 0;
    this.look = null; // the camera's turn last frame (for the hands trailing behind)
    this.lag = new THREE.Vector2();
    this.swap = { shown: null, dip: 0 }; // the item in hand, and how far it's lowered out of sight
    this.act = { busy: null, time: 0 }; // what the hands are busy with, and for how long

    const sleeve = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHex(SLEEVE.jacket, THREE.LinearSRGBColorSpace) });
    const glove = new THREE.MeshLambertMaterial({ color: GLOVE });
    this.sleeves = [sleeve]; // (tinted the colour of what you're wearing)
    // An arm: the sleeve runs back from the wrist (toward the shoulder, off screen), and the
    // gloved fist round the grip. Simple shapes until fp-hands.glb loads (see below).
    const arm = (side) => {
      const wrist = new THREE.Group();
      const shapes = new THREE.Group();
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.052, 0.48, 10).rotateX(Math.PI / 2), sleeve);
      forearm.position.set(side * 0.02, -0.01, 0.34);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.09), glove);
      fist.position.set(side * 0.008, 0, 0);
      shapes.add(forearm, fist);
      wrist.add(shapes);
      wrist.userData.shapes = shapes;
      this.group.add(wrist);
      return wrist;
    };
    this.right = arm(1);
    this.left = arm(-1);
    // The hands themselves: jointed, gloved (fp-hands.glb), their fingers bent by a HandRig to
    // close round what they hold. Each placed so a handle in its grip runs through its origin.
    this.rigs = null;
    this.grips = { right: 'relaxed', left: 'relaxed' };
    // The wrists: how far each hand's bent from its forearm (the sleeve stays with the forearm).
    this.forearms = {};
    this.bends = { right: { want: NO_BEND, now: new THREE.Quaternion() }, left: { want: NO_BEND, now: new THREE.Quaternion() } };
    loadModel('fp-hands').then((model) => {
      if (!model) return;
      const rigs = {};
      for (const [side, wrist, s, sign] of [['right', this.right, 'r', 1], ['left', this.left, 'l', -1]]) {
        const found = model.getObjectByName(`fp-${s}-hand`);
        if (!found) return;
        const hand = found.clone();
        hand.position.set(-GRIP_CENTRE.x * sign, -GRIP_CENTRE.y, -GRIP_CENTRE.z);
        const cloth = hand.getObjectByName(`fp-${side}-sleeve`);
        if (cloth) {
          cloth.material = cloth.material.clone();
          this.sleeves.push(cloth.material);
        }
        hand.traverse((child) => (child.frustumCulled = false));
        if (cloth) this.forearms[side] = { cloth, at: cloth.position.clone(), turn: cloth.quaternion.clone(), pivot: WRIST.clone().setX(WRIST.x * sign) };
        wrist.remove(wrist.userData.shapes);
        wrist.add(hand);
        rigs[side] = new HandRig(hand, sign);
      }
      this.rigs = rigs;
      // A match is held at the tip of the index finger (pinched against the thumb), pointing out.
      for (const [key, rig] of [['match', rigs.right], ['matchLeft', rigs.left]]) {
        const tip = rig.parts.index[2].part;
        const match = this.props[key];
        tip.add(match);
        match.position.set(-0.008 * rig.side, 0.002, -0.014);
        match.rotation.set(-0.6, 0, -0.5 * rig.side);
      }
      this.onHands?.();
    });

    // What the right hand can hold. Each is shown, fitted to the fist, while it's selected.
    this.tools = {};
    const holder = (name, placeholder, fit) => {
      const group = new THREE.Group();
      group.add(placeholder);
      group.scale.setScalar(HELD_SCALE);
      fit(group);
      group.visible = false;
      this.right.add(group);
      loadModel(name).then((model) => {
        if (!model) return;
        group.clear();
        group.add(model);
        if (name === 'torch') group.add(this.flame);
        if (name === 'bow') this.fitString(model);
      });
      return group;
    };
    this.flame = placeholders.flames();
    this.flame.scale.setScalar(0.32);
    this.flame.position.y = 0.52;
    this.flame.traverse((child) => (child.userData.keepColours = true));
    // (Their models are made to sit in the hand along its length, +y: turn them to point ahead.)
    // (The axe model's blade faces +z: turned round, so its edge faces ahead, away from you.)
    this.tools.axe = holder('axe', placeholders.axe(), (g) => g.rotation.set(0, Math.PI, 0));
    this.tools.knife = holder('knife', placeholders.knife(), (g) => {
      g.scale.setScalar(0.9); // (small already: life size reads better)
      g.rotation.set(KNIFE_SET, 0, 0.1); // (lying forward in the fist: the wrist tips it the rest of the way, KNIFE)
    });
    // The bow is held in the left hand, but kept upright whatever the arm's angle: it follows the
    // hand (see update) rather than turning with it.
    // (Turned round so its string faces you: the model's string is toward its back.)
    this.tools.bow = holder('bow', placeholders.bow(), (g) => {
      g.scale.setScalar(BOW_SCALE);
      g.rotation.set(0, Math.PI, -BOW_TILT);
    });
    this.right.remove(this.tools.bow);
    this.group.add(this.tools.bow);
    // The arrow on the string while you draw, pointing ahead through the bow.
    this.nocked = new THREE.Group();
    this.nocked.add(placeholders.arrow());
    this.nocked.visible = false;
    this.group.add(this.nocked);
    loadModel('arrow').then((model) => {
      if (!model) return;
      this.nocked.clear();
      this.nocked.add(model.clone());
    });
    this.pulled = 0;
    this.restOffset = new THREE.Vector3().copy(ARROW_REST);
    this.shot = { raise: 0, aim: 0, held: 0, release: Infinity, from: 0, wasDrawing: false, letGo: null };
    this.tools.torch = holder('torch', placeholders.torch(), () => {});
    this.tools.torch.add(this.flame);
    // A bandage roll, for winding round the left forearm (see ROLL and WRAP): held in the fingers,
    // its axis along the hand; and the turns it leaves round the sleeve, each a band a little
    // askew, overlapping the last, shown one by one as they go on.
    const gauze = new THREE.MeshLambertMaterial({ color: 0xe9e3d4, side: THREE.DoubleSide });
    this.roll = new THREE.Mesh(new THREE.CylinderGeometry(ROLL.radius, ROLL.radius, ROLL.width, 14), gauze);
    this.roll.position.copy(ROLL.at);
    this.right.add(this.roll);
    this.wrap = new THREE.Group();
    this.wrap.position.copy(WRAP.at);
    for (let i = 0; i < WRAP.turns; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(WRAP.radius + i * 0.0006, WRAP.radius + i * 0.0006, 0.028, 16, 1, true), gauze);
      band.rotation.set(Math.PI / 2 + (i % 2 ? 0.14 : -0.14), 0, 0);
      band.position.z = i * WRAP.pitch;
      this.wrap.add(band);
    }
    this.left.add(this.wrap);

    // Small things in the hands (hand-props.glb, from blender/hand_props.py, the steak included;
    // the berries, berry.glb). Each in the hand that holds it, its grip at the fist.
    this.props = {};
    const prop = (key, hand, fit) => {
      const group = new THREE.Group();
      fit(group);
      group.visible = false;
      hand.add(group);
      this.props[key] = group;
      return group;
    };
    // (Held in the fist, its top standing up out of it.)
    prop('lighter', this.right, (g) => g.position.set(0, 0.004, 0));
    prop('lighterLeft', this.left, (g) => g.position.set(0, 0.004, 0));
    // (A match is drawn a little bigger than life: it's a thin thing to see.)
    prop('match', this.right, (g) => {
      g.position.set(0, 0.05, -0.02);
      g.scale.setScalar(1.3);
    });
    prop('matchLeft', this.left, (g) => {
      g.position.set(0, 0.05, -0.02);
      g.scale.setScalar(1.3);
    });
    // (The box held in the fingers, its label tipped toward you.)
    // (The box stood on its end in the fingers, its striker up for the match.)
    prop('matchbox', this.right, (g) => {
      g.position.set(-0.004, 0, -0.006);
      g.rotation.set(0, 0, -Math.PI / 2);
    });
    prop('matchboxLeft', this.left, (g) => {
      g.position.set(0.004, 0, -0.006);
      g.rotation.set(0, 0, Math.PI / 2);
    });
    // (Its flat side against the palm, the fingers round the far face.)
    prop('flask', this.right, (g) => {
      g.position.set(-0.012, 0.035, -0.012);
      g.rotation.y = Math.PI / 2;
    });
    // (A steak laid across the palm, along the fingers, the hand turned palm up to carry it.)
    prop('meat', this.right, (g) => {
      g.position.set(-0.008, -0.05, 0.03);
      g.rotation.set(0, Math.PI / 2, 0);
    });
    prop('berries', this.right, (g) => g.position.set(-0.014, 0, 0.036)); // (a handful on the palm)
    loadModel('hand-props').then((model) => {
      if (!model) return;
      const take = (name) => model.getObjectByName(name) ?? model.getObjectByName(`${name}.001`);
      for (const [key, name] of [['lighter', 'prop-lighter'], ['lighterLeft', 'prop-lighter'], ['match', 'prop-match'], ['matchLeft', 'prop-match'],
        ['matchbox', 'prop-matchbox'], ['matchboxLeft', 'prop-matchbox'], ['flask', 'prop-flask']]) {
        const part = take(name);
        if (part) this.props[key].add(part.clone());
      }
      // The steak (pale: tinted raw, cooked or burnt, as on the spit).
      const steak = take('prop-steak')?.clone();
      if (steak) {
        steak.material = steak.material.clone();
        this.meatMaterial = steak.material;
        this.props.meat.add(steak);
      }
    });
    loadModel('berry').then((model) => {
      if (!model) return;
      // A small handful, piled on top of the fist.
      for (const [x, y, z, size] of [[0, 0, 0, 1], [0.018, -0.004, 0.008, 0.9], [-0.016, -0.003, 0.01, 0.95], [0.004, 0.014, 0.004, 0.85], [0.01, -0.006, -0.016, 0.9]]) {
        const berry = model.clone();
        berry.position.set(x, y, z);
        berry.scale.multiplyScalar(size);
        this.props.berries.add(berry);
      }
    });
    // Little flames: on a match or the lighter, in either hand.
    this.flames = {};
    for (const key of ['lighter', 'lighterLeft', 'match', 'matchLeft']) {
      const flame = placeholders.flames();
      flame.scale.setScalar(0.035);
      flame.position.y = key.startsWith('lighter') ? 0.05 : 0.04;
      flame.traverse((child) => (child.userData.keepColours = true));
      flame.visible = false;
      this.props[key].add(flame);
      this.flames[key] = flame;
    }

    for (const part of [this.group]) part.traverse((child) => (child.frustumCulled = false));
  }

  // Call every frame. `shown`: in first person. `item`: what's selected. `outfit`: what you're
  // wearing (for the sleeve). `player`: for chopping, stabbing, the bow and what you're busy with.
  // Where the arrow lies on the bow (on top of the bow hand), in the world (a new Vector3), if
  // you're holding the bow in the first-person view; otherwise null.
  bowCentre() {
    const bow = this.tools.bow;
    if (!this.group.visible || !bow.visible) return null;
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(this.left.position.clone().add(this.restOffset));
  }

  // Swaps the bow's string (straight, tip to tip, in the model) for two halves that meet at the
  // nock, so it can be drawn back into a V.
  fitString(model) {
    model.traverse((child) => {
      if (!child.isMesh || this.string) return;
      child.geometry = child.geometry.clone();
      const position = child.geometry.attributes.position;
      const ends = [new THREE.Vector3(0, -Infinity, 0), new THREE.Vector3(0, Infinity, 0)];
      const strand = [];
      for (let i = 0; i < position.count; i++) {
        if (position.getZ(i) > -0.09) continue; // (the string's behind the limbs)
        strand.push(i);
        const p = new THREE.Vector3().fromBufferAttribute(position, i);
        if (p.y > ends[0].y) ends[0].copy(p);
        if (p.y < ends[1].y) ends[1].copy(p);
      }
      // (The model's own string, folded away into its top end.)
      for (const i of strand) position.setXYZ(i, ends[0].x, ends[0].y, ends[0].z);
      position.needsUpdate = true;
      const material = new THREE.MeshLambertMaterial({ color: 0xd9cfb4 });
      const halves = ends.map((end) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 1, 4).translate(0, 0.5, 0).rotateX(Math.PI / 2), material);
        mesh.position.copy(end);
        mesh.frustumCulled = false;
        model.add(mesh);
        return mesh;
      });
      this.string = { ends, halves, z: (ends[0].z + ends[1].z) / 2 };
      this.pulled = -1;
    });
  }

  // Draws the string's middle (where the arrow's nocked) to `at` (in the view, with the bow in
  // the bow hand `l` as it's turned now): `pull` meters back from where it rests.
  pullString(pull, at, l) {
    if (!this.string) return;
    this.pulled = pull;
    const { ends, halves } = this.string;
    // (Into the model's own space: it's turned round, its string side toward you.)
    const nock = at.clone().sub(l.position).applyQuaternion(this.tools.bow.quaternion.clone().invert()).divideScalar(BOW_SCALE);
    halves.forEach((half, k) => {
      const along = nock.clone().sub(ends[k]);
      half.scale.set(1, 1, along.length());
      half.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along.normalize());
    });
  }

  // Call every frame. `shown`: in first person. `item`: what's selected. `outfit`: what you're
  // wearing (for the sleeve). `player`: what you're doing (chopping, stabbing, drawing the bow,
  // lighting something, eating, drinking...).
  update(dt, shown, item, outfit, player) {
    this.time += dt;
    this.group.visible = shown && !player.swimming && player.alive;
    if (!this.group.visible) {
      this.look = null;
      return;
    }
    for (const material of this.sleeves) material.color.setHex(SLEEVE[outfit ?? 'shirt'] ?? SLEEVE.jacket, THREE.LinearSRGBColorSpace);
    const busy = player.drinking ? 'drinkWater' : player.busy;
    const act = this.act;
    if (busy !== act.busy) [act.busy, act.time] = [busy, 0];
    else act.time += dt;
    const t = act.time;

    // Changing what's in your hand: the old thing goes down out of sight, the new one comes up.
    const swap = this.swap;
    const kind = KIND[item] ?? item ?? null;
    if (kind !== swap.shown) {
      swap.dip = Math.min(1, swap.dip + dt / SWAP.lower);
      if (swap.dip >= 1 || swap.shown === undefined) swap.shown = kind;
    } else swap.dip = Math.max(0, swap.dip - dt / SWAP.raise);
    const tool = swap.shown;

    // What's shown this frame (each branch below turns on what it needs).
    for (const [name, group] of Object.entries(this.tools)) group.visible = name === tool;
    for (const group of Object.values(this.props)) group.visible = false;
    for (const flame of Object.values(this.flames)) flame.visible = false;
    this.nocked.visible = false;
    this.roll.visible = false;
    this.wrap.visible = false;
    this.roll.rotation.set(0, 0, 0);
    const flicker = 0.9 + 0.1 * Math.sin(this.time * 13) + 0.05 * Math.sin(this.time * 31);
    this.flame.visible = item === 'litTorch';
    this.flame.scale.setScalar(0.32 * flicker);
    if (MEAT[item] && this.meatMaterial) this.meatMaterial.color.set(MEAT[item]);

    const walk = player.walkTime;
    // (Sprinting, the hands swing harder and drop a little: arms pumping.)
    const sway = SWAY * (player.sprinting ? 2.2 : 1);
    const bob = new THREE.Vector3(Math.sin(walk * 8.9) * sway, -Math.abs(Math.cos(walk * 8.9)) * sway - (player.sprinting ? 0.025 : 0), 0);
    let right = null; // { p, q } where each hand's going this frame, or null: down out of sight
    let left = null;
    let snap = false; // straight there (a quick, exact move), rather than easing in
    const grips = this.grips; // how each hand's fingers close (see GRIPS in handRig.js)
    grips.right = 'relaxed';
    grips.left = 'relaxed';
    const HOLD = { lighter: 'lighter', matches: 'box', flask: 'wide', meat: 'wide', berries: 'wide', bandage: 'roll' };
    const bow = tool === 'bow' && !['bandage', 'eat', 'drinkWater'].includes(busy);
    const rest = (x, y, z, rx, ry, rz) => {
      const at = pose(x, y, z, rx, ry, rz);
      at.p.add(bob);
      return at;
    };

    if (busy === 'drinkWater') {
      grips.right = grips.left = 'scoop';
      // Kneeling at the water: both hands down into it, cupped, and up to your mouth.
      for (const group of Object.values(this.tools)) group.visible = false;
      this.flame.visible = false;
      const u = (t % 1.7) / 1.7;
      // (Palms up, side by side: each hand rolled over, the right one way and the left the other.)
      const scoop = (side) => along([
        [0, pose(side * 0.06, -0.45, -0.48, -0.9, side * 0.15, -side * 1.4)],
        [0.25, pose(side * 0.05, -0.46, -0.53, -1.0, side * 0.2, -side * 1.45), easeOut],
        [0.55, pose(side * 0.04, -0.2, -0.27, -0.3, side * 0.2, -side * 1.4), smooth],
        [0.78, pose(side * 0.04, -0.17, -0.23, 0.15, side * 0.2, -side * 1.4), smooth],
        [1, pose(side * 0.06, -0.45, -0.48, -0.9, side * 0.15, -side * 1.4), easeIn],
      ], u);
      [right, left] = [scoop(1), scoop(-1)];
    } else if (bow) {
      this.animateBow(dt, busy === 'draw' ? player.drawAmount : null, [bob.x, bob.y]);
    } else if (player.chopping || player.swingTime > 0) {
      grips.right = grips.left = 'handle';
      // A swing of the axe, both hands on it: drawn back up over your right shoulder, brought
      // down hard across in front (gathering speed: it bites at 0.45, with the sound), a jolt
      // as it strikes, and back up ready. In time with the chopping (player.chopPhase), or
      // once through for a swing at an animal.
      // (The forearm can't bend at the wrist, so the axe turns in the hand instead: `w`, tipping
      // its head back over your shoulder, then forward and down into the cut.)
      const u = player.chopping ? player.chopPhase : 1 - player.swingTime / (player.swingLength || 0.83);
      right = along([
        [0, pose(0.17, -0.22, -0.42, -0.2, 0.3, -0.15, 0)],
        [0.3, pose(0.3, -0.02, -0.4, 0.35, 0.55, 0.35, 1.0), smooth],
        [0.45, pose(0.03, -0.27, -0.56, -0.2, 0.25, -0.3, -0.85), easeIn],
        [0.53, pose(0.04, -0.255, -0.54, -0.15, 0.25, -0.28, -0.72), easeOut],
        [1, pose(0.17, -0.22, -0.42, -0.2, 0.3, -0.15, 0), smooth],
      ], u);
      // (The axe tipped by bending the wrist, so its handle stays in the fist.)
      const bend = bendOf(AXE_TILT + right.w);
      right.q.multiply(bend);
      // The left hand further up the handle, turned the same way.
      const handle = new THREE.Vector3(0, 0.12, 0).applyQuaternion(right.q);
      left = { p: right.p.clone().add(handle), q: right.q.clone() };
      this.bends.right.want = this.bends.left.want = bend;
      snap = true;
    } else if (player.jab > 0 && tool === 'knife') {
      grips.right = 'handle';
      // A knife slash (SLASH): the hand's taken through it, and its arm goes with it (reach).
      const [x, y, z, roll, flex, tilt] = alongNumbers(SLASH, player.slash);
      // (The elbow lifts out to the side as the arm swings across.)
      right = this.reach('right', new THREE.Vector3(x, y, z), { roll, flex, tilt, out: 0.4 + 0.5 * player.jab });
      snap = true;
    } else if (busy === 'lightFire') {
      ({ right, left } = this.lightFire(player.busyWith, player.busyProgress, flicker));
    } else if (busy === 'lightTorch') {
      ({ right, left } = this.lightTorch(player.busyWith, player.busyProgress, flicker));
    } else if (busy === 'bandage') {
      [grips.right, grips.left] = ['roll', 'relaxed'];
      // Bandaging: the left forearm held out across in front of you, the right hand winding the
      // roll round it, over the top, down the front, under and back up, working along it; the
      // turns build up over the sleeve as it goes on.
      for (const group of Object.values(this.tools)) group.visible = false;
      ({ left, right } = this.bandage(player.busyProgress));
      this.bends.left.want = NO_BEND; // (the left forearm straight on from the hand)
      this.aimForearm('right', right.q, right.p, BANDAGE.rightElbow);
      snap = t > 0.25;
    } else if (busy === 'eat') {
      grips.right = 'cup';
      // Eating: what's in your hand up to your mouth, a bite (a tug as you tear it), and down
      // again while you chew.
      this.showProp(item, 'right');
      const u = (t % 1.15) / 1.15;
      right = along([
        // (Palm up, the food on it, tipped up toward your mouth.)
        [0, pose(0.13, -0.2, -0.37, -0.05, 0.35, PALM_UP)],
        [0.3, pose(0.03, -0.17, -0.24, 0.55, 0.3, PALM_UP + 0.2), smooth],
        [0.4, pose(0.035, -0.175, -0.26, 0.65, 0.3, PALM_UP + 0.25), easeOut],
        [0.48, pose(0.04, -0.18, -0.28, 0.5, 0.3, PALM_UP + 0.2), easeOut],
        [0.85, pose(0.12, -0.19, -0.34, 0.05, 0.35, PALM_UP), smooth],
        [1, pose(0.13, -0.2, -0.37, -0.05, 0.35, PALM_UP), smooth],
      ], u);
    } else if (busy === 'butcher') {
      [grips.right, grips.left] = ['handle', 'open'];
      // Over the carcass: the left hand holding it down, the right sawing with the knife.
      for (const group of Object.values(this.tools)) group.visible = false;
      this.tools.knife.visible = true;
      // (The knife hand down from the lower right, palm down, the blade forward and down into it,
      // sawing along; the left hand flat on the carcass, palm down, pressing as each stroke
      // pulls; both forearms back to the elbows.)
      const saw = Math.sin(this.time * 11);
      right = this.reach('right', new THREE.Vector3(0.16 - saw * 0.035, -0.22, -0.43 - saw * 0.02), BUTCHER);
      const press = Math.max(0, Math.sin(this.time * 11 + 1)) * 0.01;
      left = { p: new THREE.Vector3(-0.1, -0.25 - press, -0.47), q: PALM_DOWN_LEFT.clone(), w: 0 };
      this.aimForearm('left', left.q, left.p, ELBOW.left);
      grips.left = 'relaxed';
      snap = t > 0.25;
    } else if (busy === 'search' || busy === 'searchLow') {
      grips.right = grips.left = 'claw';
      // Rummaging: both hands in, one then the other, reaching about.
      for (const group of Object.values(this.tools)) group.visible = false;
      this.flame.visible = false;
      const low = busy === 'searchLow' ? -0.07 : 0;
      const reach = (side, phase) => {
        const a = this.time * 8 + phase;
        return pose(side * (0.12 + 0.03 * Math.sin(a * 0.7)), -0.23 + low + 0.035 * Math.max(0, Math.sin(a)), -0.5 - 0.06 * Math.cos(a), -0.4, side * 0.25, side * 0.1);
      };
      [right, left] = [reach(1, 0), reach(-1, Math.PI)];
      snap = t > 0.3;
    } else if (player.sipTime > 0 && item === 'flask') {
      grips.right = 'wide';
      // A drink from the flask: up to your lips, tipped back, and down.
      this.showProp('flask', 'right');
      const u = 1 - player.sipTime / SIP_TIME;
      right = along([
        [0, rest(0.15, -0.24, -0.4, -0.1, 0.35, -0.15)],
        [0.32, pose(0.02, -0.11, -0.22, 1.15, 0, -0.1), smooth],
        [0.7, pose(0.02, -0.1, -0.21, 1.35, 0, -0.1), smooth],
        [1, rest(0.15, -0.24, -0.4, -0.1, 0.35, -0.15), smooth],
      ], u);
    } else if (tool === 'knife') {
      grips.right = 'handle';
      right = this.reach('right', KNIFE_REST.clone().add(bob), KNIFE);
    } else if (tool === 'axe') {
      grips.right = 'handle';
      right = rest(...HAND.toArray(), -0.15, 0.3, -0.12);
      const bend = bendOf(AXE_TILT);
      right.q.multiply(bend);
      this.bends.right.want = bend;
    } else if (tool === 'torch') {
      grips.right = 'handle';
      // A torch held low and out ahead, leaning away, its flame off to the right of the view.
      right = rest(0.24, -0.305, -0.54, -0.4, 0.3, -0.12);
      right.q.multiply(bendOf(TORCH_TILT));
      this.bends.right.want = bendOf(TORCH_TILT);
    } else if (PROPS.includes(tool)) {
      grips.right = HOLD[tool];
      // A small thing held up in the right hand, where you can see it.
      this.showProp(item, 'right');
      const onPalm = tool === 'meat' || tool === 'berries';
      if (onPalm) grips.right = 'cup';
      right = rest(0.13, tool === 'flask' ? -0.22 : -0.175, tool === 'flask' ? -0.4 : -0.37, -0.1, 0.35, onPalm ? PALM_UP : -0.15);
    }
    // Reaching for something on the ground (or putting something down): the free left hand goes
    // out and down, open, closes on it, and comes back.
    if (!left && !bow && player.reachTime > 0) {
      const u = 1 - player.reachTime / REACH_TIME;
      left = along([
        [0, pose(...L_OFF.toArray(), -0.3, -0.3, 0.15)],
        [0.42, pose(-0.045, -0.29, -0.56, -0.45, -0.2, 0.2), easeOut],
        [0.58, pose(-0.045, -0.3, -0.55, -0.4, -0.2, 0.2)],
        [1, pose(...L_OFF.toArray(), -0.3, -0.3, 0.15), easeIn],
      ], u);
      grips.left = u < 0.45 ? 'open' : 'claw';
    }
    if (!bow) {
      this.shot.raise = 0;
      this.shot.aim = 0;
      this.shot.release = Infinity;
      this.shot.wasDrawing = false;
      this.place(this.right, right, HAND_OFF, snap, dt);
      this.place(this.left, left, L_OFF, snap, dt);
    }
    // The wrists: the sleeve turned back by the bend, so it stays along the forearm.
    for (const side of ['right', 'left']) {
      const bend = this.bends[side];
      bend.now.slerp(bend.want, snap ? 1 : 1 - Math.exp(-dt * EASE_IN));
      bend.want = NO_BEND;
      const arm = this.forearms[side];
      if (!arm) continue;
      const back = bend.now.clone().invert();
      arm.cloth.quaternion.copy(back).multiply(arm.turn);
      arm.cloth.position.copy(arm.at).sub(arm.pivot).applyQuaternion(back).add(arm.pivot);
    }
    if (this.rigs) {
      this.rigs.right.grip(grips.right);
      this.rigs.left.grip(grips.left);
      this.rigs.right.update(dt);
      this.rigs.left.update(dt);
    }
    // The bow, in the left hand's grip.
    this.tools.bow.position.copy(this.left.position);

    // The whole view's worth of hands: rising and falling as you breathe, trailing a little
    // behind as you turn your head, and down out of sight while you change what you hold.
    const look = this.camera.getWorldQuaternion(new THREE.Quaternion());
    if (this.look && dt > 0) {
      const turn = new THREE.Euler().setFromQuaternion(this.look.clone().invert().multiply(look), 'YXZ');
      const want = new THREE.Vector2(
        THREE.MathUtils.clamp((turn.y / dt) * LOOK_LAG, -0.04, 0.04),
        THREE.MathUtils.clamp((-turn.x / dt) * LOOK_LAG, -0.04, 0.04),
      );
      this.lag.lerp(want, 1 - Math.exp(-dt * 10));
    }
    this.look = look;
    const dip = smooth(swap.dip);
    const breathe = Math.sin(this.time * 1.7) * BREATH;
    // Landing from a jump or a drop: the hands dip with the knees, then come back up.
    const land = player.landTime > 0 ? Math.sin(Math.PI * (1 - player.landTime / LAND_TIME)) * (0.012 + 0.03 * player.landHard) : 0;
    this.group.position.set(this.lag.x, this.lag.y + breathe - dip * SWAP.depth - land, 0);
    this.group.rotation.set(-dip * 0.5, 0, 0);
  }

  // Moves a hand toward `target` ({ p, q }): straight there if `snap`, else easing in. With no
  // target, it goes down out of sight (to `away`) and is hidden once it's there.
  place(hand, target, away, snap, dt) {
    if (!target) {
      if (!hand.visible) return;
      target = { p: away, q: hand.quaternion };
      if (hand.position.distanceTo(away) < 0.03) {
        hand.visible = false;
        return;
      }
    } else if (!hand.visible) {
      // (Coming up from below, not appearing where it last was.)
      hand.position.copy(away);
      hand.visible = true;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * EASE_IN);
    hand.position.lerp(target.p, k);
    hand.quaternion.slerp(target.q, k);
  }

  // Shows the prop for `item` in the hand ('right' or 'left').
  showProp(item, hand) {
    const key = { matches: 'matchbox', cookedMeat: 'meat', rawMeat: 'meat', burntMeat: 'meat' }[item] ?? item;
    if (key === 'bandage') {
      this.roll.visible = true;
      return;
    }
    const group = this.props[hand === 'left' ? `${key}Left` : key];
    if (group) group.visible = true;
  }

  // Lighting a campfire, `p` (0-1) of the way through, with the lighter or a match. Returns the
  // hands' poses.
  lightFire(starter, p, flicker) {
    const grips = this.grips;
    const down = (side) => pose(side * 0.045 + 0.01, -0.29, -0.52, -0.5, side * 0.3, side * 0.2); // down at the kindling
    if (starter === 'matches') {
      [grips.right, grips.left] = ['pinch', 'box'];
      // The box comes up in the left hand, a match in the right; the match is struck along
      // the box's side (it flares, then settles), lifted, sheltered, and put to the kindling.
      this.props.matchboxLeft.visible = true;
      this.props.match.visible = true;
      const lit = p > 0.34;
      this.matchFlame('match', lit ? 1 + 0.9 * Math.exp(-(p - 0.34) * 30) : 0, flicker);
      const right = along([
        [0, pose(...HAND_OFF.toArray(), -0.15, 0.3, -0.12)],
        [0.2, pose(0.07, -0.15, -0.35, -0.2, 0.3, 0.5), smooth],
        [0.28, pose(-0.01, -0.152, -0.37, -0.25, 0.3, 0.75), smooth],
        [0.34, pose(0.065, -0.13, -0.33, -0.2, 0.3, 0.6), easeIn],
        [0.5, pose(0.04, -0.12, -0.34, 0, 0.3, 0.05), easeOut],
        [0.78, down(1), smooth],
        [1, down(1)],
      ], p);
      const left = along([
        [0, pose(...L_OFF.toArray(), -0.15, -0.3, 0.12)],
        [0.2, pose(-0.07, -0.17, -0.37, 0.25, -0.3, 0.1), smooth],
        [0.5, pose(-0.06, -0.17, -0.37, 0.25, -0.3, 0.1)],
        [0.62, pose(-0.015, -0.15, -0.33, 0.1, -0.7, -0.6), smooth],
        [0.78, down(-1), smooth],
        [1, down(-1)],
      ], p);
      return { right, left };
    }
    // The lighter: up in the right hand, the thumb flicks the wheel (a jerk of the hand) and it
    // catches; the left hand comes up to shelter the flame, and both go down to the kindling.
    this.props.lighter.visible = true;
    [grips.right, grips.left] = ['lighter', p > 0.38 ? 'cup' : 'relaxed'];
    this.flick('right', p, 0.29, 0.38);
    this.matchFlame('lighter', p > 0.36 ? 1 : 0, flicker);
    const right = along([
      [0, pose(...HAND_OFF.toArray(), -0.15, 0.3, -0.12)],
      [0.26, pose(0.05, -0.14, -0.34, 0, 0.3, -0.1), smooth],
      [0.32, pose(0.05, -0.145, -0.34, 0.12, 0.3, -0.25), easeIn],
      [0.38, pose(0.05, -0.14, -0.34, 0, 0.3, -0.1), easeOut],
      [0.8, down(1), smooth],
      [1, down(1)],
    ], p);
    const left = along([
      [0, pose(...L_OFF.toArray(), -0.15, -0.3, 0.12)],
      [0.3, pose(...L_OFF.toArray(), -0.15, -0.3, 0.12)],
      [0.5, pose(-0.02, -0.15, -0.33, 0.1, -0.7, -0.6), smooth],
      [0.8, down(-1), smooth],
      [1, down(-1)],
    ], p);
    return { right, left };
  }

  // Lighting the torch in your right hand, `p` (0-1) of the way through: from `source`, the
  // lighter or a match in your left hand, or 'fire' (held in a campfire's flames).
  lightTorch(source, p, flicker) {
    this.grips.right = 'handle';
    const catching = (from) => smooth((p - from) / (1 - from));
    if (source === 'fire') {
      // Down and forward into the flames, held there until it catches.
      this.flame.visible = true;
      this.flame.scale.setScalar(0.32 * flicker * catching(0.45));
      const right = along([
        [0, pose(0.24, -0.305, -0.54, -0.4, 0.3, -0.12, 0)],
        [0.35, pose(0.09, -0.3, -0.62, -0.55, 0.2, 0.15, -0.85), smooth],
        [0.85, pose(0.09, -0.31, -0.64, -0.6, 0.2, 0.15, -0.9)],
        [1, pose(0.16, -0.31, -0.58, -0.45, 0.28, 0, -0.3), smooth],
      ], p);
      // (Its head tipped forward and down into the flames: the wrist bent.)
      const bend = bendOf(TORCH_TILT + right.w);
      right.q.multiply(bend);
      this.bends.right.want = bend;
      return { right, left: null };
    }
    // The torch held up and leaning in; the left hand brings the lighter (or a match, struck
    // with a flick of the thumb) up under its head, and holds the flame there until it catches.
    const right = pose(0.1, -0.2, -0.46, -0.25, 0.25, 0.4);
    right.q.multiply(bendOf(TORCH_TILT));
    this.bends.right.want = bendOf(TORCH_TILT);
    const torch = this.tools.torch;
    torch.updateMatrix();
    const head = this.flame.position.clone().applyMatrix4(torch.matrix).applyQuaternion(right.q).add(right.p);
    // (The flame's a hand's height above the fist: the fist under the head, the forearm down and back.)
    const under = { p: head.clone().add(new THREE.Vector3(-0.03, -0.15, 0.03)), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, -0.25, -0.1)) };
    const key = source === 'matches' ? 'matchLeft' : 'lighterLeft';
    this.props[key].visible = true;
    const lightAt = source === 'matches' ? 0.4 : 0.38;
    this.grips.left = source === 'matches' ? 'pinch' : 'lighter';
    if (source !== 'matches') this.flick('left', p, lightAt - 0.08, lightAt + 0.01);
    this.matchFlame(key, p > lightAt ? 1 + (source === 'matches' ? 0.9 * Math.exp(-(p - lightAt) * 30) : 0) : 0, flicker);
    const flick = { p: under.p.clone().add(new THREE.Vector3(0.01, -0.012, 0)), q: under.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, 0.25))) };
    const left = along([
      [0, pose(...L_OFF.toArray(), -0.15, -0.3, 0.12)],
      [0.32, under, smooth],
      [lightAt - 0.02, flick, easeIn],
      [lightAt + 0.04, under, easeOut],
      [1, under],
    ], p);
    this.flame.visible = p > 0.55;
    this.flame.scale.setScalar(0.32 * flicker * catching(0.55));
    return { right, left };
  }

  // The thumb rolling the lighter's wheel: down hard across it and back, between `from` and `to` of
  // the way through (`p`).
  flick(hand, p, from, to) {
    const rig = this.rigs?.[hand];
    if (!rig || p < from || p > to) return;
    const u = (p - from) / (to - from);
    const press = u < 0.7 ? smooth(u / 0.7) : 1 - smooth((u - 0.7) / 0.3);
    rig.extra = { thumb: [0, 0.35 * press, 0.45 * press, 0.3 * press] };
  }

  // The little flame on a match or the lighter (`key`), at `size` (0: out), flickering.
  matchFlame(key, size, flicker) {
    const flame = this.flames[key];
    flame.visible = size > 0;
    flame.scale.setScalar(0.035 * size * flicker);
  }

  // Turns the bow hand `l` to the bow's grip (as the bow's turned now): closed round it the one
  // way its fingers fit (BOW_HOLD); and bends the wrist so the forearm (the sleeve) runs back to
  // the shoulder.
  holdBow(l) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.tools.bow.quaternion);
    const frame = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const hand = this.tools.bow.quaternion.clone().multiply(BOW_HOLD);
    // The forearm: +z back along it to the shoulder, its +y as near the riser's up as it can be.
    const back = BOW_SHOULDER.clone().sub(l.position).normalize();
    const side = up.clone().cross(back).normalize();
    const forearm = frame(side, back.clone().cross(side), back);
    l.quaternion.copy(hand);
    this.bends.left.want = forearm.invert().multiply(hand);
  }

  // How the draw hand's turned on the string at the nock `nock`, `pull` (0-1) of the way to the
  // anchor (see DRAW_ELBOW): its up along the bow's string, its wrist toward the elbow (half of
  // the way the elbow drops below the hand: the wrist takes the rest).
  drawHand(nock, pull) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.tools.bow.quaternion);
    const back = DRAW_ELBOW.start.clone().lerp(DRAW_ELBOW.anchor, smooth(pull)).sub(nock);
    back.addScaledVector(up, -0.5 * back.dot(up)).normalize();
    up.addScaledVector(back, -up.dot(back)).normalize();
    const side = up.clone().cross(back).normalize();
    const hand = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, back));
    return hand.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), DRAW_ROLL));
  }

  // Bends the draw hand's wrist (the hand turned `turn`, at `at`) so its forearm runs back to the
  // elbow (DRAW_ELBOW), `pull` (0-1) of the way to the anchor.
  drawWrist(turn, at, pull) {
    this.aimForearm('right', turn, at, DRAW_ELBOW.start.clone().lerp(DRAW_ELBOW.anchor, smooth(pull)));
  }

  // A hand at `at` (its grip, in the view) on the end of its arm (`side`: 'right' or 'left'):
  // works out where the elbow is (see SHOULDER), runs the forearm from there to the wrist, and
  // turns the hand from the forearm only as an arm can: `roll` (radians: the forearm turned about
  // itself, 0 thumb up, toward palm down), and at the wrist `flex` (bent toward the palm; less
  // than 0, toward the back of the hand) and `tilt` (tipped toward the thumb; less than 0, toward
  // the little finger, the knuckles forward), each kept to what a wrist does (WRIST_BENDS).
  // `out`: how far the elbow's swung out from your side (0: straight down), and `lift`: how far
  // it's raised (-1: hanging down; above 0, higher than the hand, as when you lean over
  // something). Returns the hand's pose ({ p, q }), and bends its wrist to suit.
  reach(side, at, { roll = 0, flex = 0, tilt = 0, out = 0.4, lift = -1 } = {}) {
    const sign = side === 'right' ? 1 : -1;
    const clamp = (value, [least, most]) => Math.min(most, Math.max(least, value));
    const bend = new THREE.Quaternion().setFromAxisAngle(AXIS.z, roll * sign)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS.y, clamp(flex, WRIST_BENDS.flex) * sign))
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS.x, clamp(tilt, WRIST_BENDS.tilt)));
    const shoulder = SHOULDER[side];
    // (The wrist, from the grip, in the hand's own space: where the forearm ends.)
    const joint = new THREE.Vector3((WRIST.x - GRIP_CENTRE.x) * sign, WRIST.y - GRIP_CENTRE.y, WRIST.z - GRIP_CENTRE.z);
    const q = new THREE.Quaternion();
    const wrist = at.clone();
    // (The wrist's place depends on how the hand's turned, and that on where the forearm comes
    // from: a few rounds settle it.)
    for (let i = 0; i < 4; i++) {
      // The elbow: where the upper arm and the forearm meet, on the side `out` says.
      const span = wrist.clone().sub(shoulder);
      const far = Math.min(UPPER_ARM + FOREARM - 0.002, Math.max(0.05, span.length()));
      span.normalize();
      const along = (UPPER_ARM ** 2 - FOREARM ** 2 + far ** 2) / (2 * far);
      const drop = new THREE.Vector3(out * sign, lift, 0.1);
      drop.addScaledVector(span, -drop.dot(span)).normalize();
      const elbow = shoulder.clone().addScaledVector(span, along).addScaledVector(drop, Math.sqrt(Math.max(0, UPPER_ARM ** 2 - along ** 2)));
      // The forearm: back from the wrist to the elbow; thumb up is toward the upper arm.
      const back = elbow.clone().sub(wrist).normalize();
      const up = shoulder.clone().sub(elbow);
      up.addScaledVector(back, -up.dot(back)).normalize();
      q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(up.clone().cross(back), up, back)).multiply(bend);
      wrist.copy(joint).applyQuaternion(q).add(at);
    }
    this.bends[side].want = bend;
    return { p: at.clone(), q, w: 0 };
  }

  // Bends a hand's wrist (`side`: 'right' or 'left'; the hand turned `turn`, at `at`) so its
  // forearm, the sleeve, runs back from it to `elbow` (in the view), whatever the hand's doing:
  // never swinging out sideways or pointing at you because the hand's turned.
  aimForearm(side, turn, at, elbow) {
    const back = elbow.clone().sub(at).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const across = up.clone().cross(back).normalize();
    const forearm = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, back.clone().cross(across), back));
    this.bends[side].want = forearm.invert().multiply(turn.clone());
  }

  // Bandaging, `p` (0-1) of the way through: the hands' poses ({ left, right }). The left arm
  // held out ahead of you from the lower left, palm up (BANDAGE.left); the right hand, its forearm
  // in from the lower right, carries the roll round the left forearm, the roll's axis along it:
  // up from under its near side, over the top and down the far side (the wrist turning as far as
  // a wrist can), then quickly back under, out of sight, for the next turn. The turns stay on as
  // they're made (WRAP's bands), working along the forearm.
  bandage(p) {
    const at = BANDAGE.left.clone();
    const along = BANDAGE.elbow.clone().sub(at).normalize(); // (from the left hand back along its forearm)
    const palmUp = new THREE.Vector3(0, 1, 0).addScaledVector(along, -along.y).normalize();
    const left = { p: at, q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(palmUp, along.clone().cross(palmUp), along)), w: 0 };
    const reached = Math.min(WRAP.turns, Math.floor(p * (WRAP.turns + 0.5)));
    this.wrap.visible = true;
    this.wrap.children.forEach((band, i) => (band.visible = i < Math.max(1, reached)));
    this.roll.visible = true;
    this.roll.rotation.set(0, this.time * 9, 0); // (turning as it unwinds)
    // Round the forearm (angle 0 over the top, + toward its far side): most of each turn on the
    // way over, the last of it quickly back underneath.
    const u = (this.time * 1.1) % 1;
    const over = 0.78;
    const [from, to] = BANDAGE.arc;
    const a = u < over ? from + (to - from) * smooth(u / over) : to + (from + Math.PI * 2 - to) * ((u - over) / (1 - over));
    const z = WRAP.at.z + Math.min(reached, WRAP.turns - 1) * WRAP.pitch;
    const centre = left.p.clone().add(WRAP.at.clone().setZ(z).applyQuaternion(left.q));
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(along, -along.y).normalize();
    const far = along.clone().cross(up).normalize(); // (the forearm's far side, away from your right hand)
    const out = (angle) => up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(far, Math.sin(angle)).normalize();
    // (The hand: its up along the forearm, so the roll's axis is too; its palm toward the arm.
    // Under the arm, on the quick way back, it just turns from where it finished to where it
    // starts again.)
    const turnAt = (o) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(o, along, o.clone().cross(along)));
    const q = u < over ? turnAt(out(a)) : turnAt(out(to)).slerp(turnAt(out(from)), smooth((u - over) / (1 - over)));
    const rollAt = centre.addScaledVector(out(a), WRAP.radius + ROLL.radius + 0.004);
    const right = { p: rollAt.sub(ROLL.at.clone().applyQuaternion(q)), q, w: 0 };
    return { left, right };
  }

  // The bow in your hands: `draw` is how far it's drawn (0-1), or null if you're not drawing.
  animateBow(dt, draw, bob) {
    const shot = this.shot;
    const r = this.right;
    const drawing = draw !== null;
    // Let go: the arrow's away.
    if (shot.wasDrawing && !drawing) {
      shot.release = 0;
      shot.from = this.pulled;
      shot.letGo = r.position.clone();
      shot.letGoTurn = r.quaternion.clone();
    }
    shot.wasDrawing = drawing;
    if (!drawing) shot.release += dt;
    const t = shot.release;

    // Raised to ready as you start to draw, and up to aim as the string comes back (quickly,
    // keeping up with the draw); after a shot, held up a moment, then lowered to carry again.
    const follow = !drawing && t < 0.45; // (just loosed: still held up)
    const ready = drawing || follow ? 1 : 0;
    const aim = drawing ? smooth(Math.min(1, Math.max(0, (draw - REACH) / (1 - REACH)) / 0.5)) : follow ? shot.aim : 0;
    shot.raise += (ready - shot.raise) * (1 - Math.exp(-dt * (ready > shot.raise ? 9 : 3)));
    shot.aim += (aim - shot.aim) * (1 - Math.exp(-dt * (aim > shot.aim ? 14 : 3)));
    const raise = smooth(shot.raise);
    const aimed = smooth(shot.aim);
    shot.held = drawing && draw >= 1 ? shot.held + dt : 0;
    // Held at full draw, the bow arm begins to shake.
    const shake = Math.min(1, shot.held / 4) * 0.0035;
    const tremble = new THREE.Vector3(Math.sin(this.time * 31) * shake, Math.sin(this.time * 23 + 1) * shake, 0);
    // The bow's kick in the hand as the string goes: forward, the top tipping away.
    const kick = t < 0.6 ? Math.sin(Math.min(1, t / 0.04) * Math.PI * 0.5) * Math.exp(-t / 0.12) : 0;

    const l = this.left;
    l.visible = true;
    // (Walking, the bow swings with your stride, less so the higher it's held.)
    const swing = new THREE.Vector3(bob[0], bob[1], 0).multiplyScalar(1 - aimed);
    l.position.copy(BOW_CARRY.at).lerp(BOW_READY.at, raise).lerp(DRAW_GRIP, aimed).add(swing).add(tremble);
    l.position.z -= kick * 0.025;
    const held = (key, aimedAt) => THREE.MathUtils.lerp(THREE.MathUtils.lerp(BOW_CARRY[key], BOW_READY[key], raise), aimedAt, aimed);
    this.tools.bow.rotation.set(-held('tip', 0) - kick * 0.18, Math.PI, held('lean', BOW_AIM_CANT));
    this.holdBow(l);

    // Where the shaft lies on the bow hand, and the nock on the string behind it.
    // (The rest's on the bow: it turns with it. The model's turned round, so its -x is your right.)
    this.restOffset.set(-ARROW_REST.x, ARROW_REST.y, 0).applyQuaternion(this.tools.bow.quaternion);
    const rest = l.position.clone().add(this.restOffset);
    const reach = drawing ? smooth(Math.min(1, draw / REACH)) : 0;
    const pullT = drawing ? Math.max(0, Math.min(1, (draw - REACH) / (1 - REACH))) : 0;
    let pull = (1 - (1 - pullT) ** 2.2) * DRAW_LENGTH; // (quick at first, slowing to the anchor)
    if (!drawing && t < 0.6) {
      // The string springs forward past straight and quivers back to rest.
      pull = shot.from * Math.exp(-t / RELEASE.snap) * Math.cos(t * RELEASE.quiver * Math.PI * 2);
    }
    // Drawn back toward your face, in under your eye: as the bow comes up to aim, the nock
    // comes onto the line from the crosshair's target back through the arrow rest, so the arrow
    // points where it'll fly.
    const nockZ = l.position.z + BRACE + Math.max(0, pull);
    const sighted = AIM_AT.clone().lerp(rest, (nockZ - AIM_AT.z) / (rest.z - AIM_AT.z));
    // (On the string at first, in line with the stave, level with the rest.)
    const onBow = new THREE.Vector3(0, ARROW_REST.y, 0).applyQuaternion(this.tools.bow.quaternion).add(l.position);
    onBow.z = nockZ;
    const nock = onBow.lerp(sighted, drawing ? aimed : 0);
    const strung = nock.clone();
    strung.z = l.position.z + BRACE + Math.max(-0.02, pull); // (springing forward past straight as it's loosed)
    this.pullString(Math.max(-0.02, pull), strung, l);
    // (The hand turned to the string, its hook on the nock.)
    const turn = this.drawHand(nock, drawing ? pullT : 0);
    const onString = nock.clone().sub(HOOK.clone().applyQuaternion(turn));

    // The right hand: the arrow pinched by its nock as it comes up, then three fingers hooked
    // round the string; they spring open as it goes.
    this.grips.left = 'bow';
    this.grips.right = drawing ? (reach < 0.85 ? 'pinch' : 'string') : t < 0.05 ? 'open' : 'relaxed';
    r.visible = true;
    if (drawing) {
      if (reach < 1) {
        // Up from below, in an arc, to the string.
        r.position.lerpVectors(HAND_OFF, onString, reach);
        r.position.y += Math.sin(reach * Math.PI) * 0.06;
        r.position.x += Math.sin(reach * Math.PI) * 0.03;
        r.quaternion.slerpQuaternions(AT_REST, turn, reach);
      } else {
        r.position.copy(onString);
        r.quaternion.copy(turn);
      }
    } else if (shot.letGo && t < RELEASE.follow + RELEASE.away) {
      // Follow-through: the fingers spring open off the string and the hand slides back along
      // your jaw toward your ear, out of sight, relaxing; then it drops away.
      const back = shot.letGo.clone().add(FOLLOW_THROUGH);
      const eased = shot.letGoTurn.clone().multiply(LET_GO);
      if (t < RELEASE.follow) {
        const u = 1 - (1 - t / RELEASE.follow) ** 3;
        r.position.lerpVectors(shot.letGo, back, u);
        r.quaternion.slerpQuaternions(shot.letGoTurn, eased, u);
      } else {
        const u = smooth((t - RELEASE.follow) / RELEASE.away);
        r.position.lerpVectors(back, HAND_OFF, u);
        r.quaternion.slerpQuaternions(eased, AT_REST, u);
      }
    } else {
      r.visible = false;
      r.position.copy(HAND_OFF);
    }
    // (Whenever it's in view, its forearm runs back to the elbow, never straight at you: low as
    // it brings the arrow up, level behind at the anchor, and dropping away after the shot.)
    if (r.visible) this.drawWrist(r.quaternion, r.position, drawing ? pullT : Math.max(0, 1 - t / (RELEASE.follow + RELEASE.away)));

    // The arrow: in the hand's fingers as it comes up, then laid on the bow hand and the string.
    this.nocked.visible = drawing;
    if (drawing) {
      const aimed = rest.clone().sub(nock).normalize();
      const carried = new THREE.Vector3(-0.35, 0.25, -1).normalize(); // (pointing up and ahead, across)
      const along = reach < 1 ? carried.lerp(aimed, reach).normalize() : aimed;
      // (Carried in the fingers, then put on the string: at the end of the reach the hand's hook
      // is on the nock, the pull not yet begun.)
      const hooked = HOOK.clone().applyQuaternion(r.quaternion);
      this.nocked.position.copy(reach < 1 ? r.position.clone().add(CARRY.clone().lerp(hooked, smooth((reach - 0.6) / 0.4))) : nock);
      this.nocked.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
    }
  }
}

// Eases 0-1 in and out.
function smooth(u) {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

// A pose for a hand: where it is, and how it's turned (Euler angles, radians).
// (`w`: anything else that moves with it, e.g. how far the axe's turned in the hand.)
function pose(x, y, z, rx = 0, ry = 0, rz = 0, w = 0) {
  return { p: new THREE.Vector3(x, y, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), w };
}

// The pose `t` of the way along a run of keys [[time, pose, ease]] (times 0-1, rising): each ease
// shapes the move into that key.
function along(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, b, ease = smooth] = keys[i];
    if (t > t1) continue;
    const [t0, a] = keys[i - 1];
    const u = ease((t - t0) / Math.max(1e-6, t1 - t0));
    return { p: a.p.clone().lerp(b.p, u), q: a.q.clone().slerp(b.q, u), w: a.w + (b.w - a.w) * u };
  }
  return keys[keys.length - 1][1];
}
// The numbers `t` of the way along a run of keys [time, ...numbers, ease] (times 0-1, rising): each
// ease (the last thing in a key, if it has one) shapes the move into that key.
function alongNumbers(keys, t) {
  const numbers = (key) => key.slice(1).filter((value) => typeof value === 'number');
  if (t <= keys[0][0]) return numbers(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (t > keys[i][0]) continue;
    const ease = keys[i].find((value) => typeof value === 'function') ?? smooth;
    const u = ease((t - keys[i - 1][0]) / Math.max(1e-6, keys[i][0] - keys[i - 1][0]));
    const from = numbers(keys[i - 1]);
    return numbers(keys[i]).map((to, k) => from[k] + (to - from[k]) * u);
  }
  return numbers(keys[keys.length - 1]);
}
const easeIn = (u) => Math.max(0, Math.min(1, u)) ** 2.4; // speeding up (a strike)
const easeOut = (u) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 2.4; // slowing down (coming to rest)
const linear = (u) => Math.max(0, Math.min(1, u));
