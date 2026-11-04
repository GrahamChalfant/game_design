import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

// What you see of your own hands in the first-person view: the right forearm and hand, and
// whatever's in it (the axe, the knife, the bow, a torch), moving as you chop, stab, draw the
// bow or walk. Bandaging brings the left arm up too. The player's own model is hidden from the
// camera in this view (it would be all inside your head), so this stands in for it, fixed to
// the camera: x is right, y up and -z straight ahead, in meters.
const HAND = new THREE.Vector3(0.3, -0.38, -0.66); // where the right hand rests
const SWAY = 0.012; // how far the hand bobs as you walk
const SLEEVE = { shirt: 0x4a5560, jacket: 0x661411, parka: 0x8a6a4a }; // (linear, as in outfits.js)
const SKIN = 0x9e6140;
const TOOLS = ['axe', 'knife', 'bow', 'torch', 'litTorch'];

export class HandView {
  constructor(camera, scene) {
    if (!camera.parent) scene.add(camera); // (the camera's children are only drawn if it's in the scene)
    this.group = new THREE.Group();
    this.group.visible = false;
    camera.add(this.group);
    this.time = 0;

    const sleeve = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHex(SLEEVE.jacket, THREE.LinearSRGBColorSpace) });
    const skin = new THREE.MeshLambertMaterial({ color: SKIN });
    this.sleeve = sleeve;
    // An arm: the sleeve runs back from the wrist (toward the shoulder, off screen), with a cuff
    // and the hand at the front.
    const arm = (side) => {
      const wrist = new THREE.Group();
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.42), sleeve);
      forearm.position.z = 0.24;
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.095, 0.05), sleeve);
      cuff.position.z = 0.04;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.09), skin);
      hand.position.set(0, -0.005, -0.04);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06), skin);
      thumb.position.set(-side * 0.045, 0.02, -0.05);
      wrist.add(forearm, cuff, hand, thumb);
      this.group.add(wrist);
      return wrist;
    };
    this.right = arm(1);
    this.left = arm(-1);

    // What the right hand can hold. Each is shown, fitted to the fist, while it's selected.
    this.tools = {};
    const holder = (name, placeholder, fit) => {
      const group = new THREE.Group();
      group.add(placeholder);
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
    this.tools.axe = holder('axe', placeholders.axe(), (g) => g.rotation.set(-0.35, 0, 0));
    this.tools.knife = holder('knife', placeholders.knife(), (g) => g.rotation.set(-Math.PI / 2 + 0.25, 0, 0));
    this.tools.bow = holder('bow', placeholders.bow(), (g) => g.rotation.set(0, 0, 0.12));
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
    this.sleeve.color.setHex(SLEEVE[outfit ?? 'shirt'] ?? SLEEVE.jacket, THREE.LinearSRGBColorSpace);
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
    r.rotation.set(0.15, 0.25, 0);
    this.left.visible = false;
    this.roll.visible = false;
    this.wrap.visible = false;
    r.visible = holding || ['bandage', 'eat', 'butcher', 'search', 'searchLow'].includes(busy);

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
      // Drawing the bow: held up in front, the string hand pulled back toward your cheek.
      const d = player.drawAmount;
      r.position.set(0.05, -0.12, -0.55);
      r.rotation.set(0, 0, 0);
      this.left.visible = true;
      this.left.position.set(0.04, -0.09, -0.5 + d * 0.3);
      this.left.rotation.set(0, 0, 0);
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
  }
}
