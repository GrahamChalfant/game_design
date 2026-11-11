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
const BOW_HAND = new THREE.Vector3(-0.12, -0.1, -0.62); // where the left hand holds the bow up
const BOW_ARM = [0.35, -0.85, 0.1]; // the left forearm's angle: in from the lower left, like an archer's
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
//    hand flies back past your cheek, fingers open, then drops away out of sight.
const DRAW_GRIP = new THREE.Vector3(-0.02, -0.075, -0.62);
// At full draw the nock's under your eye and a little below the arrow rest (at your chin).
const NOCK_ANCHOR = { x: 0, drop: 0.035 }; // the bow hand at full draw: the arrow just under your eye
const ARROW_REST = new THREE.Vector3(-0.03, 0.058, 0); // where the shaft lies, from the bow hand's grip: on top of the fist, left of the stave
const REACH = 0.35; // the share of the draw spent bringing the arrow to the string
const HAND_OFF = new THREE.Vector3(0.24, -0.44, -0.3); // the right hand, out of sight below, while you hold the bow
// The right hand, from the nock, its fingers round the string: on the string at first, and at full
// draw tucked under your jaw (below and right of the nock, out of the way of your eye).
// Three fingers hooked round the string, the nock between the first and second: where that hook
// is from the hand's grip point (in the hand's own space). The hand's turned about it so the
// forearm runs back and down toward your shoulder (ON_STRING), more so at the anchor (ANCHORED).
const HOOK = new THREE.Vector3(-0.006, 0.02, -0.046);
const CARRY = new THREE.Vector3(0, 0.01, 0.07); // the arrow's nock, from the right hand, as it brings the arrow up (in the fist, nock toward you)
const ON_STRING = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, 0.3, 0)); // (palm to the left, the fingers' hook upright round the string)
const ANCHORED = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.75, 0.45, 0.1));
const AT_REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, 0.3, -0.12));
const LET_GO = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.9, -1.0)); // (fingers opened, hand turned away)
const RELEASE = { snap: 0.07, quiver: 16, follow: 0.12, away: 0.5 }; // seconds: string settles, Hz, follow-through, hand drops away
const SWAY = 0.012; // how far the hand bobs as you walk
const TORCH_TILT = -0.25; // the torch in the hand, leaning away from you
// The wrist bent forward, so a knife points ahead out of the fist (the forearm stays as it was).
const KNIFE_BEND = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95, 0, 0));
const BUTCHER_BEND = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.75, 0, 0)); // (further, the blade pointing down)
const NO_BEND = new THREE.Quaternion();
const WRIST = new THREE.Vector3(0.003, 0, 0.065); // the wrist joint, in the hand model's space (the right's; the left's is mirrored)
const PALM_UP = -1.45; // how far the hand rolls over to hold something on its palm (radians, round the forearm)
const AXE_TILT = -0.55; // the axe in the hand, its head tipped forward
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
    this.tools.axe = holder('axe', placeholders.axe(), (g) => g.rotation.set(AXE_TILT, Math.PI, -0.1));
    this.tools.knife = holder('knife', placeholders.knife(), (g) => {
      g.scale.setScalar(0.9); // (small already: life size reads better)
      g.rotation.set(-0.1, 0, 0.1); // (up through the fist: the wrist bends it forward, KNIFE_BEND)
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
    this.shot = { raise: 0, held: 0, release: Infinity, from: 0, wasDrawing: false, letGo: null };
    this.tools.torch = holder('torch', placeholders.torch(), (g) => g.rotation.set(TORCH_TILT, 0, 0));
    this.tools.torch.add(this.flame);
    // A bandage roll, for winding round the left forearm.
    this.roll = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), new THREE.MeshLambertMaterial({ color: 0xe9e3d4 }));
    this.roll.position.set(-0.014, 0.012, -0.012); // (in the fingers, standing up)
    this.right.add(this.roll);
    this.wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.1, 10, 1, true), this.roll.material);
    this.wrap.rotation.x = Math.PI / 2;
    this.wrap.position.z = 0.12;
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
    return this.group.localToWorld(this.left.position.clone().add(ARROW_REST));
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

  // Draws the string back `pull` meters at the middle (where the arrow's nocked), and `across`
  // and `up` from in line with the bow (meters, in the view).
  pullString(pull, across = 0, up = 0) {
    if (!this.string) return;
    this.pulled = pull;
    const { ends, halves, z } = this.string;
    // (The model's turned round: its string side, -z, is toward you, and its x is reversed.)
    const nock = new THREE.Vector3(-across / BOW_SCALE, (ARROW_REST.y + up) / BOW_SCALE, z - pull / BOW_SCALE);
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
    const flicker = 0.9 + 0.1 * Math.sin(this.time * 13) + 0.05 * Math.sin(this.time * 31);
    this.flame.visible = item === 'litTorch';
    this.flame.scale.setScalar(0.32 * flicker);
    if (MEAT[item] && this.meatMaterial) this.meatMaterial.color.set(MEAT[item]);

    const walk = player.walkTime;
    const bob = new THREE.Vector3(Math.sin(walk * 8.9) * SWAY, -Math.abs(Math.cos(walk * 8.9)) * SWAY, 0);
    let right = null; // { p, q } where each hand's going this frame, or null: down out of sight
    let left = null;
    let snap = false; // straight there (a quick, exact move), rather than easing in
    const grips = this.grips; // how each hand's fingers close (see GRIPS in handRig.js)
    grips.right = 'relaxed';
    grips.left = 'relaxed';
    const HOLD = { lighter: 'lighter', matches: 'box', flask: 'wide', meat: 'wide', berries: 'wide', bandage: 'wide' };
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
      const axe = this.tools.axe;
      axe.rotation.x = AXE_TILT + right.w;
      // The left hand further up the handle, turned the same way.
      const handle = new THREE.Vector3(0, 1, 0).applyQuaternion(axe.quaternion).multiplyScalar(0.12);
      left = { p: right.p.clone().add(handle.applyQuaternion(right.q)), q: right.q.clone() };
      snap = true;
    } else if (player.jab > 0 && tool === 'knife') {
      grips.right = 'handle';
      // A knife jab: punched out ahead, the wrist turning the blade over as it goes.
      const j = player.jab;
      right = pose(0.2 - 0.08 * j, -0.205 + 0.06 * j, -0.42 - 0.28 * j, -0.15 - 0.2 * j, 0.3 - 0.25 * j, -0.12 + 0.35 * j);
      right.q.multiply(KNIFE_BEND);
      this.bends.right.want = KNIFE_BEND;
      snap = true;
    } else if (busy === 'lightFire') {
      ({ right, left } = this.lightFire(player.busyWith, player.busyProgress, flicker));
    } else if (busy === 'lightTorch') {
      ({ right, left } = this.lightTorch(player.busyWith, player.busyProgress, flicker));
    } else if (busy === 'bandage') {
      [grips.right, grips.left] = ['wide', 'relaxed'];
      // Bandaging: the left forearm held out across in front, the right hand winding the roll
      // round and round it.
      for (const group of Object.values(this.tools)) group.visible = false;
      this.wrap.visible = true;
      this.roll.visible = true;
      this.roll.rotation.y = this.time * 9; // (turning as it unwinds)
      const a = this.time * 7;
      left = pose(0.08, -0.22, -0.44, 0.2, -1.2, 0);
      right = pose(0.08 + Math.cos(a) * 0.065, -0.17 + Math.sin(a) * 0.065, -0.44 + Math.sin(a) * 0.02, 0.2, 0.4, 0);
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
      const saw = Math.sin(this.time * 11);
      right = pose(0.12 + saw * 0.035, -0.28, -0.5 - saw * 0.06, -0.35, 0.2, 0.1);
      right.q.multiply(BUTCHER_BEND); // (the blade down into it)
      this.bends.right.want = BUTCHER_BEND;
      left = pose(-0.11, -0.3 + Math.max(0, Math.sin(this.time * 11 + 1)) * 0.012, -0.52, -0.4, -0.25, 0);
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
    } else if (tool === 'axe' || tool === 'knife') {
      grips.right = 'handle';
      right = rest(...HAND.toArray(), -0.15, 0.3, -0.12);
      if (tool === 'knife') {
        right.q.multiply(KNIFE_BEND);
        this.bends.right.want = KNIFE_BEND;
      }
    } else if (tool === 'torch') {
      grips.right = 'handle';
      // A torch held low and out ahead, leaning away, its flame off to the right of the view.
      right = rest(0.24, -0.305, -0.54, -0.4, 0.3, -0.12);
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
    if (!(player.chopping || player.swingTime > 0)) this.tools.axe.rotation.x = AXE_TILT;
    if (!(busy === 'lightTorch' && player.busyWith === 'fire')) this.tools.torch.rotation.x = TORCH_TILT;
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
      // (Its head tipped forward and down into the flames.)
      this.tools.torch.rotation.x = TORCH_TILT + right.w;
      return { right, left: null };
    }
    // The torch held up and leaning in; the left hand brings the lighter (or a match, struck
    // with a flick of the thumb) up under its head, and holds the flame there until it catches.
    const right = pose(0.1, -0.2, -0.46, -0.25, 0.25, 0.4);
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

    // Raised (or lowered), easing over a few tenths of a second.
    shot.raise += ((drawing ? 1 : 0) - shot.raise) * (1 - Math.exp(-dt * (drawing ? 9 : 4)));
    const raise = smooth(shot.raise);
    shot.held = drawing && draw >= 1 ? shot.held + dt : 0;
    // Held at full draw, the bow arm begins to shake.
    const shake = Math.min(1, shot.held / 4) * 0.0035;
    const tremble = new THREE.Vector3(Math.sin(this.time * 31) * shake, Math.sin(this.time * 23 + 1) * shake, 0);
    // The bow's kick in the hand as the string goes: forward, the top tipping away.
    const kick = t < 0.6 ? Math.sin(Math.min(1, t / 0.04) * Math.PI * 0.5) * Math.exp(-t / 0.12) : 0;

    const l = this.left;
    l.visible = true;
    l.position.copy(BOW_HAND).add(new THREE.Vector3(bob[0], bob[1], 0)).lerp(DRAW_GRIP, raise).add(tremble);
    l.position.z -= kick * 0.025;
    l.rotation.set(...BOW_ARM);
    this.tools.bow.rotation.set(-kick * 0.18, Math.PI, -BOW_TILT * (1 - 0.6 * raise));

    // Where the shaft lies on the bow hand, and the nock on the string behind it.
    const rest = l.position.clone().add(ARROW_REST);
    const reach = drawing ? smooth(Math.min(1, draw / REACH)) : 0;
    const pullT = drawing ? Math.max(0, Math.min(1, (draw - REACH) / (1 - REACH))) : 0;
    let pull = (1 - (1 - pullT) ** 2.2) * DRAW_LENGTH; // (quick at first, slowing to the anchor)
    if (!drawing && t < 0.6) {
      // The string springs forward past straight and quivers back to rest.
      pull = shot.from * Math.exp(-t / RELEASE.snap) * Math.cos(t * RELEASE.quiver * Math.PI * 2);
    }
    // Drawn back toward your face: in under your eye, and down to your chin.
    const anchor = drawing ? smooth(pullT) : 0;
    const across = (NOCK_ANCHOR.x - l.position.x) * anchor;
    const up = -NOCK_ANCHOR.drop * anchor;
    this.pullString(Math.max(-0.02, pull), across, up);
    const nock = new THREE.Vector3(l.position.x + across, rest.y + up, l.position.z + BRACE + Math.max(0, pull));
    // (The hand turned about its hook, which stays on the nock.)
    const turn = ON_STRING.clone().slerp(ANCHORED, smooth(pullT));
    const onString = nock.clone().sub(HOOK.clone().applyQuaternion(turn));

    // The right hand: the arrow pinched by its nock as it comes up, then three fingers hooked
    // round the string; they spring open as it goes.
    this.grips.left = 'handle';
    this.grips.right = drawing ? (reach < 0.85 ? 'pinch' : 'string') : 'open';
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
      // Follow-through: back past your cheek and out, fingers opening; then away out of sight.
      const back = shot.letGo.clone().add(new THREE.Vector3(0.07, 0.01, 0.07));
      if (t < RELEASE.follow) {
        const u = 1 - (1 - t / RELEASE.follow) ** 3;
        r.position.lerpVectors(shot.letGo, back, u);
        r.quaternion.slerpQuaternions(shot.letGoTurn, LET_GO, u);
      } else {
        const u = smooth((t - RELEASE.follow) / RELEASE.away);
        r.position.lerpVectors(back, HAND_OFF, u);
        r.quaternion.slerpQuaternions(LET_GO, AT_REST, u);
      }
    } else {
      r.visible = false;
      r.position.copy(HAND_OFF);
    }

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
const easeIn = (u) => Math.max(0, Math.min(1, u)) ** 2.4; // speeding up (a strike)
const easeOut = (u) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 2.4; // slowing down (coming to rest)
const linear = (u) => Math.max(0, Math.min(1, u));
