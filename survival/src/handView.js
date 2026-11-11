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
    this.tools.bow = holder('bow', placeholders.bow(), (g) => g.rotation.set(0, 0, BOW_TILT));
    this.right.remove(this.tools.bow);
    this.group.add(this.tools.bow);
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
    this.roll.visible = false;
    this.wrap.visible = false;
    r.visible = (holding && tool !== 'bow') || ['bandage', 'eat', 'butcher', 'search', 'searchLow'].includes(busy);
    if (tool === 'bow' && busy !== 'bandage' && busy !== 'eat') {
      // The bow held up in the left hand, in front and a little to the left, leaning over.
      this.left.visible = true;
      this.left.position.copy(BOW_HAND).add(new THREE.Vector3(bob[0], bob[1], 0));
      this.left.rotation.set(...BOW_ARM);
    }

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
    } else if (busy === 'draw') {
      // Drawing the bow: raised and brought in to the middle, the right hand on the string,
      // pulling it back toward your cheek.
      const d = player.drawAmount;
      this.left.position.set(-0.06, -0.06, -0.62);
      this.left.rotation.set(...BOW_ARM);
      r.visible = true;
      r.position.set(-0.04, -0.04, -0.56 + d * 0.32);
      r.rotation.set(0.3, 0.5, -1.4);
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
    // The bow, in the left hand's grip, upright.
    this.tools.bow.position.copy(this.left.position);
  }
}
