import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

// What you see of your own hands in the first-person view: your arms in their sleeves, in wool
// gloves (fp-arms.glb, from blender/first_person.py), and whatever's in your hands: the axe,
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
const PINCH = new THREE.Vector3(0.05, -0.11, 0.035); // (below the nock, so the arrow on the bow hand shows)
const ANCHOR = new THREE.Vector3(0.06, -0.085, 0.03);
const CARRY = new THREE.Vector3(0, 0.01, 0.07); // the arrow's nock, from the right hand, as it brings the arrow up (in the fist, nock toward you)
const ON_STRING = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.5, -1.4));
const AT_REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, 0.3, -0.12));
const LET_GO = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.9, -1.0)); // (fingers opened, hand turned away)
const RELEASE = { snap: 0.07, quiver: 16, follow: 0.12, away: 0.5 }; // seconds: string settles, Hz, follow-through, hand drops away
const SWAY = 0.012; // how far the hand bobs as you walk
const SLEEVE = { shirt: 0x4a5560, jacket: 0x661411, parka: 0x8a6a4a }; // (linear, as in outfits.js)
const GLOVE = 0x3a3632;
const TOOLS = ['axe', 'knife', 'bow', 'torch', 'litTorch'];

export class HandView {
  constructor(camera, scene) {
    if (!camera.parent) scene.add(camera); // (the camera's children are only drawn if it's in the scene)
    this.group = new THREE.Group();
    this.group.visible = false;
    camera.add(this.group);
    this.time = 0;

    const sleeve = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHex(SLEEVE.jacket, THREE.LinearSRGBColorSpace) });
    const glove = new THREE.MeshLambertMaterial({ color: GLOVE });
    this.sleeves = [sleeve]; // (tinted the colour of what you're wearing)
    // An arm: the sleeve runs back from the wrist (toward the shoulder, off screen), and the
    // gloved fist round the grip. Simple shapes until fp-arms.glb loads (see below).
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
    loadModel('fp-arms').then((model) => {
      if (!model) return;
      for (const [side, wrist] of [['right', this.right], ['left', this.left]]) {
        const fist = model.getObjectByName(`fp-${side}-glove`);
        const cloth = model.getObjectByName(`fp-${side}-sleeve`);
        if (!fist || !cloth) continue;
        wrist.remove(wrist.userData.shapes);
        const parts = new THREE.Group();
        const sleeveCopy = cloth.clone();
        sleeveCopy.material = cloth.material.clone();
        this.sleeves.push(sleeveCopy.material);
        parts.add(fist.clone(), sleeveCopy);
        parts.traverse((child) => (child.frustumCulled = false));
        wrist.add(parts);
      }
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
    this.tools.axe = holder('axe', placeholders.axe(), (g) => g.rotation.set(-0.55, Math.PI, -0.1));
    this.tools.knife = holder('knife', placeholders.knife(), (g) => {
      g.scale.setScalar(0.9); // (small already: life size reads better)
      g.rotation.set(-Math.PI / 2 + 0.35, 0, 0.25);
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
    this.tools.torch = holder('torch', placeholders.torch(), (g) => g.rotation.set(-0.25, 0, 0));
    this.tools.torch.add(this.flame);
    // A bandage roll, for winding round the left forearm.
    this.roll = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), new THREE.MeshLambertMaterial({ color: 0xe9e3d4 }));
    this.roll.rotation.z = Math.PI / 2;
    this.roll.position.set(0, 0.04, -0.05);
    this.right.add(this.roll);
    this.wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.1, 10, 1, true), this.roll.material);
    this.wrap.rotation.x = Math.PI / 2;
    this.wrap.position.z = 0.12;
    this.left.add(this.wrap);

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

  update(dt, shown, item, outfit, player) {
    this.time += dt;
    this.group.visible = shown && !player.swimming && !player.drinking && player.alive;
    if (!this.group.visible) return;
    for (const material of this.sleeves) material.color.setHex(SLEEVE[outfit ?? 'shirt'] ?? SLEEVE.jacket, THREE.LinearSRGBColorSpace);
    const busy = player.busy;
    const tool = item === 'litTorch' ? 'torch' : item;
    const holding = TOOLS.includes(item);
    for (const [name, group] of Object.entries(this.tools)) group.visible = name === tool && busy !== 'bandage' && busy !== 'eat';
    this.flame.visible = item === 'litTorch';
    if (busy === 'butcher' && this.tools.knife) this.tools.knife.visible = true;

    // Bob as you walk (in step with the feet).
    const walk = player.walkTime;
    const bob = [Math.sin(walk * 8.9) * SWAY, -Math.abs(Math.cos(walk * 8.9)) * SWAY];
    const r = this.right;
    r.position.copy(HAND).add(new THREE.Vector3(bob[0], bob[1], 0));
    r.rotation.set(-0.15, 0.3, -0.12);
    this.left.visible = false;
    this.nocked.visible = false;
    this.roll.visible = false;
    this.wrap.visible = false;
    r.visible = (holding && tool !== 'bow') || ['bandage', 'eat', 'butcher', 'search', 'searchLow'].includes(busy);
    const bow = tool === 'bow' && busy !== 'bandage' && busy !== 'eat';

    if (player.chopping || player.swingTime > 0) {
      // Chopping: up over the shoulder, then down and across in front.
      const t = (this.time * 1.2) % 1;
      const swing = t < 0.55 ? -Math.sin((t / 0.55) * Math.PI * 0.5) : -1 + Math.sin(((t - 0.55) / 0.45) * Math.PI * 0.5) * 1.6;
      r.position.add(new THREE.Vector3(-0.06 * (1 + swing), 0.12 * -swing, 0.05 * swing));
      r.rotation.x = 0.15 - swing * 0.9;
    } else if (player.jab > 0) {
      // A knife jab: the fist punches straight ahead.
      r.position.add(new THREE.Vector3(-0.08 * player.jab, 0.06 * player.jab, -0.28 * player.jab));
      r.rotation.x = 0.15 - 0.15 * player.jab;
    } else if (bow) {
      this.animateBow(dt, busy === 'draw' ? player.drawAmount : null, bob);
    } else if (busy === 'bandage') {
      // Bandaging: the left forearm held out across in front, the right hand winding round it.
      this.left.visible = true;
      this.left.position.set(0.12, -0.32, -0.42);
      this.left.rotation.set(0.2, -1.2, 0);
      this.wrap.visible = true;
      this.roll.visible = true;
      const a = this.time * 7;
      r.position.set(0.1 + Math.cos(a) * 0.07, -0.27 + Math.sin(a) * 0.07, -0.42);
      r.rotation.set(0.2, 0.4, 0);
    } else if (busy === 'eat') {
      // Eating: the hand comes up to the mouth between bites.
      const bite = Math.max(0, Math.sin(this.time * 7));
      r.position.set(0.12, -0.2 + bite * 0.08, -0.35 + bite * 0.1);
      r.rotation.set(0.7, 0.4, 0);
    } else if (busy === 'butcher' || busy === 'searchLow' || busy === 'search') {
      // Down at the carcass (or in a suitcase): sawing or rummaging.
      const saw = Math.sin(this.time * 11);
      r.position.set(0.15 + saw * 0.04, -0.42, -0.5 - saw * 0.06);
      r.rotation.set(-0.5, 0.2, 0);
    } else if (tool === 'torch') {
      // A torch held low and out ahead, leaning away, its flame off to the right of the view.
      r.position.add(new THREE.Vector3(0.04, -0.1, -0.12));
      r.rotation.x = -0.4;
    }
    if (!bow) {
      this.shot.raise = 0;
      this.shot.release = Infinity;
      this.shot.wasDrawing = false;
    }
    // The bow, in the left hand's grip.
    this.tools.bow.position.copy(this.left.position);
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
    const onString = nock.clone().add(PINCH.clone().lerp(ANCHOR, smooth(pullT)));

    // The right hand.
    r.visible = true;
    if (drawing) {
      if (reach < 1) {
        // Up from below, in an arc, to the string.
        r.position.lerpVectors(HAND_OFF, onString, reach);
        r.position.y += Math.sin(reach * Math.PI) * 0.06;
        r.position.x += Math.sin(reach * Math.PI) * 0.03;
        r.quaternion.slerpQuaternions(AT_REST, ON_STRING, reach);
      } else {
        r.position.copy(onString);
        r.quaternion.copy(ON_STRING);
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
      // (Carried in the fist, then moved along in the fingers to the string: at the end of the
      // reach the hand's at PINCH from the nock, the pull not yet begun.)
      this.nocked.position.copy(reach < 1 ? r.position.clone().add(CARRY.clone().lerp(PINCH.clone().negate(), smooth((reach - 0.6) / 0.4))) : nock);
      this.nocked.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
    }
  }
}

// Eases 0-1 in and out.
function smooth(u) {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}
