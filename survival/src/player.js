import * as THREE from 'three';
import { loadModel, swappable } from './models.js';
import { dressModel } from './outfits.js';
import * as placeholders from './placeholders.js';
import { MAX_CLIMB } from './terrain.js';

const TORCH_LIGHT = 7; // how bright a lit torch is (a campfire is 18): about an 8 m pool of light at night
const TORCH_LIGHT_RANGE = 14; // meters its light reaches
const TORCH_TIP = 0.52; // the top of the torch (where the flame goes), above the hand
const TORCH_HOLD_TILT = -Math.PI / 2 + 0.35; // turns the torch in the hand: upright, leaning a little forward
const RADIUS = 0.4;
const WALK_SPEED = 5;
const SNEAK_SPEED = 1.7; // (a careful crouching walk: about a third of walking pace)
const SWIM_SPEED = 2.2;
const SWIM_DEPTH = 1.25; // once the water is this deep, the player swims with their head above water
const TURN_SPEED = 12;
const JUMP_SPEED = 5.5; // how fast you leave the ground: about a 0.75 m hop, 0.55 s in the air
const GRAVITY = 20;
const JUMP_MAX_DEPTH = 0.3; // too deep in the water to jump beyond this
const TOP_MARGIN = 0.1; // feet this close below the top of a rock or stump still clear it
const TOP_OVERHANG = 0.25; // how far past a rock's edge the player can stand on it
const STEP = 0.6; // the most you can step up or down onto a floor (stairs, the tower) without jumping
const HIDDEN_LAYER = 1; // (see hideFromCamera)
const STEP_OVER = 0.35; // low rocks and thin logs this far above your feet you just walk up onto (hidden in grass, they'd snag you)
// Steep ground: going up, from STEEP_FROM you slow down until at MAX_CLIMB (in terrain.js)
// you're scrambling, and steeper than that you can't climb at all. Going down, you walk
// normally down any slope, but step off ground steeper than CLIFF and you fall, and a long
// fall hurts (see takeFall).
const STEEP_FROM = THREE.MathUtils.degToRad(25);
const SCRAMBLE_SPEED = 1.2;
const CLIFF = THREE.MathUtils.degToRad(60);
const SAFE_FALL = 3; // meters you can drop without getting hurt
const FALL_DAMAGE = 9; // health lost per meter dropped beyond that
const KNIFE_GRIP_OFFSET = 0.01; // nudge so the middle of knife.glb's handle (1 cm below its origin) sits in the fist
const STAB_TIME = 0.32; // seconds a knife jab lasts: a quick thrust, then the arm comes back
const STAB_THRUST = 0.3;
export const SIP_TIME = 1.1; // seconds a drink from the flask takes
export const REACH_TIME = 0.55; // seconds a reach for something takes (picking it up, putting it down)
export const LAND_TIME = 0.35; // seconds the body takes to absorb landing from a jump or a drop // the share of the jab spent thrusting forward
const FADE_TIME = 0.15; // seconds to blend from one animation to the next
const POSE_SPEED = 8; // how quickly the arms move into and out of a pose (see poseArms)
const HURT_TIME = 0.45; // seconds the player reels after being hit
const KNOCKBACK = 7; // m/s a hit throws the player back at first
const TORCH_LEAN = 0.25; // a held torch leans this far forward from upright (radians)
// Where each foot comes down in player.glb's walking animations, as a share of the cycle (they
// start on the left foot's contact: blender/player_anim.py), so footstep sounds land with the feet.
const FOOTFALLS = { walk: [0.0, 0.5], sneak: [0.0, 0.5] };

export class Player {
  constructor(scene, spawn, bounds, spawnFacing = 0) {
    this.position = spawn.clone();
    this.spawnFacing = spawnFacing;
    this.facing = spawnFacing;
    this.walkTime = 0;
    this.jumpHeight = 0; // how far above the ground the player's feet are right now
    this.standingHeight = 0; // how high above the ground the rock or stump underfoot is, if any
    this.jumpSpeed = 0;
    this.crouched = false;
    this.bounds = bounds;
    this.spawn = spawn.clone();
    this.alive = true;
    this.cave = null; // the cave you're down in (see caves.js), or null on the surface

    this.object = new THREE.Group();
    this.body = placeholders.survivor();
    this.object.add(this.body);
    scene.add(this.object);

    // The axe, shown in the player's right hand while it's selected.
    this.axe = placeholders.axe();
    this.axe.position.set(0.42, 0.85, 0.05);
    this.axe.visible = false;
    this.object.add(this.axe);
    loadModel('axe').then((model) => {
      if (!model) return;
      this.axe.clear();
      this.axe.add(model);
    });

    // The bow, shown in the right hand while it's selected (stand-in until bow.glb loads).
    this.bow = new THREE.Group();
    this.bow.add(placeholders.bow());
    loadModel('bow').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.castShadow = true));
      this.bow.clear();
      this.bow.add(model);
    });
    this.bow.position.set(-0.4, 1.0, 0.25);
    this.bow.scale.setScalar(0.8);
    this.bow.visible = false;
    this.object.add(this.bow);

    // The stone knife (#75), in the right hand while selected (stand-in until knife.glb loads).
    this.knife = new THREE.Group();
    this.knife.add(placeholders.knife());
    loadModel('knife').then((model) => {
      if (!model) return;
      this.knife.clear();
      // knife.glb's origin is at the guard/hide wrap: handle runs 7.5 cm down -Y, blade from
      // +4.5 cm up +Y. Nudged so the fist closes on the handle with the blade clear in front.
      model.position.y = KNIFE_GRIP_OFFSET;
      this.knife.add(model);
    });
    this.knife.position.set(0.42, 0.9, 0.2);
    this.knife.visible = false;
    this.object.add(this.knife);
    this.stabTime = 0; // counts down after a stab, to jab the knife forward
    this.jab = 0; // how far out the arm is in that jab (0–1)
    this.swingTime = 0; // counts down through one axe swing at an animal
    this.busy = null; // what the hands are doing: 'search', 'searchLow', 'eat', 'bandage', 'butcher', 'draw', 'lightFire', 'lightTorch' or null
    this.busyWith = null; // lighting: what with ('lighter', 'matches', or 'fire' for a torch held to one)
    this.busyProgress = 0; // how far through what it's busy with (0-1), where that's timed
    this.chopPhase = 0; // how far through the current chop (0-1; the axe bites at 0.45)
    this.sipTime = 0; // counts down through a drink from the flask
    this.reachTime = 0; // counts down through reaching for something (see reach)
    this.landTime = 0; // counts down after landing from a jump or a fall...
    this.landHard = 0; // ...and how hard it was (0-1)
    this.drawAmount = 0; // how far the bow is drawn (0–1), while drawing it
    this.pose = null; // the arm pose being shown (stays set while it fades out)
    this.poseWeight = 0;
    this.footfalls = 0; // feet that have come down since takeFootfalls was last called
    this.fallFrom = null; // while in the air, the highest the feet have been
    this.fallDamage = 0; // health lost to landing from a long fall, since takeFallDamage was last called
    this.hurtTime = 0; // counts down after being hit
    this.knock = new THREE.Vector2(); // how fast a hit is pushing the player back

    // A torch (#94), in the right hand while selected. Lit, it has a flame and lights up the
    // dark around the player.
    this.torch = swappable('torch', placeholders.torch());
    this.torch.userData.tip = TORCH_TIP;
    this.torchFlame = placeholders.flames();
    this.torchFlame.scale.setScalar(0.32);
    this.torchFlame.position.y = this.torch.userData.tip;
    this.torchLight = new THREE.PointLight(0xff9a3c, 0, TORCH_LIGHT_RANGE, 1.4);
    this.torchLight.position.y = this.torch.userData.tip + 0.5;
    this.torch.add(this.torchFlame, this.torchLight);
    this.torch.position.set(0.42, 0.85, 0.05);
    this.torch.visible = false;
    this.object.add(this.torch);
    this.flicker = 0;

    loadModel('player').then((model) => {
      if (!model) return;
      model.traverse((child) => {
        child.castShadow = true;
        // Its animations move it beyond where three.js thinks it is, so always draw it.
        child.frustumCulled = false;
      });
      this.object.remove(this.body);
      this.body = model;
      this.object.add(model);

      // The axe goes in the right hand, with its handle pointing forward.
      model.getObjectByName('hand_R').add(this.axe);
      this.axe.position.set(0, 0.03, 0.02);
      this.axe.rotation.set(Math.PI / 2, 0, 0);
      // bow.glb's origin is the grip, so it sits in the hand with its tips along the arm's up axis.
      model.getObjectByName('hand_R').add(this.bow);
      this.bow.position.set(0, 0.03, 0.02);
      this.bow.rotation.set(0, 0, 0);
      this.bow.scale.setScalar(1);
      // knife's origin is the grip; the blade points along the hand's up axis, like the bow.
      model.getObjectByName('hand_R').add(this.knife);
      // The torch is held upright, flame up, a little out in front.
      model.getObjectByName('hand_R').add(this.torch);
      this.torch.position.set(0, 0.03, 0.02);
      this.torch.rotation.set(TORCH_HOLD_TILT, 0, 0);
      this.knife.position.set(0, 0.03, 0.02);
      this.knife.rotation.set(Math.PI / 2, 0, 0);
      // Bandaging: a roll in the right hand, and the wrap going on round the left forearm.
      const linen = new THREE.MeshLambertMaterial({ color: 0xe9e3d4 });
      // (Big enough to show past the fist and round the sleeve.)
      this.bandageRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 10), linen);
      this.bandageRoll.position.set(0, -0.07, 0.06);
      this.bandageRoll.rotation.z = Math.PI / 2;
      model.getObjectByName('hand_R').add(this.bandageRoll);
      this.bandageWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.14, 10, 1, true), linen);
      this.bandageWrap.position.y = -0.14; // (part way down the forearm, which hangs along -y)
      model.getObjectByName('lowerarm_L').add(this.bandageWrap);
      for (const part of [this.bandageRoll, this.bandageWrap]) part.visible = false;

      this.mixer = new THREE.AnimationMixer(model);
      this.clips = Object.fromEntries(model.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]));
      for (const clip of [this.clips.die, this.clips.jump]) {
        clip.setLoop(THREE.LoopOnce);
        clip.clampWhenFinished = true;
      }
      this.play('idle');
      this.bones = Object.fromEntries(
        ['spine', 'upperarm_L', 'lowerarm_L', 'upperarm_R', 'lowerarm_R', 'hand_R'].map((name) => [name, model.getObjectByName(name)]),
      );
    });
  }

  // Blends into the named animation, playing it at `speed` times its normal rate.
  play(name, speed = 1) {
    const clip = this.clips[name];
    clip.timeScale = speed;
    if (this.playing === clip) return;
    clip.reset().play();
    if (this.playing) clip.crossFadeFrom(this.playing, FADE_TIME);
    this.playing = clip;
  }

  // What the player holds ('axe', 'wood', null), whether they're chopping or drinking,
  // and whether they've found the backpack yet.
  // Shows what the player is wearing over their coat (see outfits.js). Call every frame.
  wear(outfit) {
    dressModel(this.body, outfit);
  }

  setAction(heldItem, chopping, drinking, hasBackpack, busy = null) {
    this.axe.visible = heldItem === 'axe' && !this.swimming && !drinking; // put away when the hands are busy
    this.bow.visible = heldItem === 'bow' && !this.swimming && !drinking;
    this.knife.visible = heldItem === 'knife' && !this.swimming && !drinking;
    const torch = heldItem === 'torch' || heldItem === 'litTorch';
    this.torch.visible = torch && !this.swimming && !drinking;
    this.torchLit = heldItem === 'litTorch' && this.torch.visible;
    this.torchFlame.visible = this.torchLit;
    this.body.getObjectByName('player-pack').visible = hasBackpack;
    this.chopping = chopping;
    this.drinking = drinking;
    this.busy = busy;
    for (const part of [this.bandageRoll, this.bandageWrap]) if (part) part.visible = busy === 'bandage';
  }

  // Hit by something at (fromX, fromZ), reel back and get knocked away.
  hit(fromX, fromZ) {
    this.hurtTime = HURT_TIME;
    this.knock.set(this.position.x - fromX, this.position.z - fromZ).normalize().multiplyScalar(KNOCKBACK);
  }

  // True while in the air from a jump, or falling off a rock.
  get airborne() {
    return this.jumpHeight > this.standingHeight;
  }

  // Picks the animation for what the player is doing now.
  animate(dt, moving, speed) {
    if (!this.alive) this.play('die');
    else if (this.swimming) this.play('swim');
    else if (this.airborne) this.play('jump');
    else if (this.drinking) this.play('drink');
    else if (this.chopping || this.swingTime > 0) this.play('chop');
    else if (this.busy === 'searchLow' || this.busy === 'butcher' || this.busy === 'lightFire') this.play('crouch'); // down on your knees
    else if (moving) this.play(this.sneaking ? 'sneak' : 'walk', speed / (this.sneaking ? SNEAK_SPEED : WALK_SPEED));
    else this.play(this.sneaking ? 'crouch' : 'idle');
    const clip = this.playing;
    const before = clip.time;
    this.mixer.update(dt);
    // Count the feet that came down this frame (see takeFootfalls).
    const falls = moving && FOOTFALLS[clip.getClip().name];
    if (falls) {
      const length = clip.getClip().duration;
      const [a, b] = [before / length, clip.time / length];
      for (const f of falls) if (b >= a ? f > a && f <= b : f > a || f <= b) this.footfalls++;
    }
    if (this.alive) this.poseArms(dt);
  }

  // Bends the arms (on top of the animation) for things player.glb has no animation for:
  // rummaging through a suitcase, eating, bandaging, holding up a torch, and reeling from a hit.
  // Directions are in the player's own space: +y up, +z forward, `side` out to that arm's side.
  poseArms(dt) {
    const b = this.bones;
    if (!b?.spine) return;
    const t = this.flicker; // (a steady clock)
    const busy = this.swimming || this.drinking || this.chopping ? null : this.busy;
    if (busy) this.pose = busy;
    this.poseWeight += ((busy ? 1 : 0) - this.poseWeight) * Math.min(1, dt * POSE_SPEED);
    const w = this.poseWeight;
    const arm = (side, upper, lower, weight = w) => {
      const [up, low] = side > 0 ? [b.upperarm_L, b.lowerarm_L] : [b.upperarm_R, b.lowerarm_R];
      this.aimBone(up, upper, weight);
      this.aimBone(low, lower, weight);
    };
    const rummage = (side, speed) => Math.sin(t * speed + side) * 0.35;
    if (w > 0.01) {
      if (this.pose === 'searchLow') {
        // Kneeling, both hands down in the suitcase, rummaging about.
        for (const side of [1, -1]) arm(side, [side * 0.25, -0.55, 0.8], [rummage(side, 9), -0.75, 0.6]);
      } else if (this.pose === 'search') {
        // Standing, both hands reaching into the locker.
        for (const side of [1, -1]) arm(side, [side * 0.2, -0.3, 0.95], [rummage(side, 9) - side * 0.2, 0.05, 1]);
      } else if (this.pose === 'eat') {
        // The right hand up to the mouth, between bites.
        const bite = Math.max(0, Math.sin(t * 7)) * 0.25;
        arm(-1, [-0.25, -0.75, 0.55], [0.55, 0.8 - bite, 0.25 + bite]);
      } else if (this.pose === 'draw') {
        // Drawing the bow: the bow arm (right) straight out in front, the string hand (left)
        // pulled back toward the chest the further it's drawn.
        const d = this.drawAmount;
        arm(-1, [-0.1, 0.08, 1], [-0.04, 0.08, 1]);
        arm(1, [0.35, 0.05, 1 - d * 0.9], [-1, 0.05, 0.9 - d * 0.9]);
      } else if (this.pose === 'bandage') {
        // Standing, the left forearm held out across the chest, the right hand winding a
        // bandage round and round it.
        const wind = t * 7;
        arm(1, [0.3, -0.55, 0.75], [-0.6, 0.1, 0.8]);
        arm(-1, [-0.2, -0.5, 0.8], [0.35 + Math.cos(wind) * 0.3, 0.05 + Math.sin(wind) * 0.3, 0.85]);
      } else if (this.pose === 'lightFire') {
        // Kneeling at the fire, both hands down at the kindling, sheltering the flame.
        for (const side of [1, -1]) arm(side, [side * 0.15, -0.6, 0.8], [-side * 0.25, -0.7, 0.65]);
      } else if (this.pose === 'lightTorch') {
        // The torch held out in front, the other hand bringing the flame up to it (or, at a
        // campfire, the torch reaching down into the flames).
        if (this.busyWith === 'fire') arm(-1, [-0.1, -0.45, 0.9], [-0.05, -0.6, 0.8]);
        else for (const side of [1, -1]) arm(side, [side * 0.2, -0.35, 0.9], [-side * 0.3, 0.05, 0.95]);
      } else if (this.pose === 'butcher') {
        // Kneeling over the carcass: the left hand holds it down, the right saws at it with the knife.
        const saw = Math.sin(t * 11) * 0.35;
        arm(1, [0.25, -0.75, 0.6], [0.05, -0.9, 0.45]);
        arm(-1, [-0.2, -0.7, 0.65 + saw * 0.4], [-0.05, -0.75, 0.6 + saw]);
      }
    }
    // A knife jab: the right arm punches straight out in front.
    if (this.jab > 0 && !(w > 0.5)) arm(-1, [-0.12, -0.2, 1], [-0.02, -0.05, 1], this.jab);
    // Holding a torch: the elbow bent at 90 degrees, the forearm out in front, flame upright.
    if (this.torch.visible && !(w > 0.5 && this.pose !== 'eat')) {
      arm(-1, [-0.12, -1, 0.12], [-0.05, 0.02, 1], 1 - w);
      this.uprightTorch();
    } else if (this.torch.visible) this.uprightTorch();
    // Hit: rock back from the waist, quickly at first, then straighten up.
    if (this.hurtTime > 0) {
      const reel = Math.sin((this.hurtTime / HURT_TIME) * Math.PI);
      this.aimBone(b.spine, [0, 1, -0.55], reel * 0.8);
    }
  }

  // Turns `bone` (blended by `weight`) so it points along `direction`, given in the player's
  // own space. In player.glb the spine points along its own +y, and the arm bones (which hang
  // down from the shoulder) along their own -y.
  aimBone(bone, [x, y, z], weight) {
    if (weight <= 0) return;
    const { _v, _q, _w, _p } = Player.scratch;
    bone.updateWorldMatrix(true, false);
    bone.getWorldQuaternion(_w);
    const now = _v.set(0, bone.name.includes('arm') ? -1 : 1, 0).applyQuaternion(_w);
    this.body.getWorldQuaternion(_p);
    const want = Player.scratch._t.set(x, y, z).normalize().applyQuaternion(_p);
    _q.setFromUnitVectors(now, want).multiply(_w); // the world rotation it should have
    bone.parent.getWorldQuaternion(_p).invert();
    _q.premultiply(_p);
    bone.quaternion.slerp(_q, Math.min(1, weight));
    bone.updateWorldMatrix(false, true);
  }

  // Keeps a held torch standing up, leaning a little forward, however the hand is turned.
  uprightTorch() {
    const { _q, _p } = Player.scratch;
    this.body.getWorldQuaternion(_q).multiply(Player.scratch._r.setFromAxisAngle(Player.scratch._x, TORCH_LEAN));
    this.torch.parent.getWorldQuaternion(_p).invert();
    this.torch.quaternion.copy(_q.premultiply(_p));
  }

  static scratch = {
    _v: new THREE.Vector3(), _t: new THREE.Vector3(), _x: new THREE.Vector3(1, 0, 0),
    _q: new THREE.Quaternion(), _w: new THREE.Quaternion(), _p: new THREE.Quaternion(), _r: new THREE.Quaternion(),
  };

  // In the first-person view the camera is inside your head, so the body's meshes go on a layer
  // the camera doesn't draw. Only the meshes: a lit torch's light stays on, which hiding the
  // whole model would switch off. (Call every frame while hidden: tools load in later.)
  hideFromCamera(hidden) {
    this.object.traverse((child) => {
      if (child.isMesh) child.layers.set(hidden ? HIDDEN_LAYER : 0);
    });
  }

  // One swing of the axe at an animal (the chopping animation, once through).
  swingAxe() {
    this.swingTime = this.clips?.chop?.getClip().duration ?? 0.8;
    this.swingLength = this.swingTime;
    if (this.playing === this.clips?.chop) this.clips.chop.time = 0;
  }

  // Health lost to landing hard (off a cliff) since this was last asked.
  takeFallDamage() {
    const damage = Math.round(this.fallDamage);
    this.fallDamage = 0;
    return damage;
  }

  // How many times a foot has come down in the walking animation since this was last asked,
  // or null before player.glb has loaded (no animation to follow yet).
  takeFootfalls() {
    if (!this.mixer) return null;
    const falls = this.footfalls;
    this.footfalls = 0;
    return falls;
  }

  // A quick forward jab of the knife (no stab animation in player.glb, so poseArms thrusts the arm).
  stab() {
    this.stabTime = STAB_TIME;
  }

  // Reaching out to take something (or put something down): the free hand goes out and back.
  reach() {
    this.reachTime = REACH_TIME;
  }

  // A drink from the flask: up to the lips, tipped, and down again.
  sip() {
    this.sipTime = SIP_TIME;
  }

  update(dt, input, world) {
    // A lit torch flickers.
    this.flicker += dt;
    const flicker = 0.85 + 0.1 * Math.sin(this.flicker * 13) + 0.05 * Math.sin(this.flicker * 31);
    this.torchLight.intensity = this.torchLit ? TORCH_LIGHT * flicker : 0;
    this.torchFlame.scale.setScalar(0.32 * (0.9 + 0.15 * flicker));
    this.stabTime = Math.max(0, this.stabTime - dt);
    this.swingTime = Math.max(0, (this.swingTime ?? 0) - dt);
    this.sipTime = Math.max(0, this.sipTime - dt);
    this.reachTime = Math.max(0, this.reachTime - dt);
    this.landTime = Math.max(0, this.landTime - dt);
    // How far out the arm is in a jab: shoots out fast, comes back slower (0 → 1 → 0).
    const p = 1 - this.stabTime / STAB_TIME;
    this.jab = this.stabTime === 0 ? 0 : p < STAB_THRUST ? 1 - (1 - p / STAB_THRUST) ** 2 : 1 - ((p - STAB_THRUST) / (1 - STAB_THRUST)) ** 2;
    // The blade stays pointing out past the knuckles: thrust out (see poseArms), it points straight ahead.
    this.knife.rotation.x = Math.PI / 2;
    if (!this.mixer) {
      // Swing the axe while chopping; otherwise rest it on the shoulder.
      this.chopTime = this.chopping ? (this.chopTime ?? 0) + dt : 0;
      this.axe.rotation.x = this.chopping ? 0.5 + Math.sin(this.chopTime * 9) * 1.1 : 0.35;
    }

    if (!this.alive) {
      if (this.mixer) this.animate(dt);
      // Slowly topple over.
      else this.body.rotation.x += (-Math.PI / 2 - this.body.rotation.x) * Math.min(1, dt * 3);
      return;
    }

    // Knocked back by a hit: slide away (around trees and rocks), slowing quickly.
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    if (this.knock.lengthSq() > 0.01) {
      this.tryMove(this.knock.x * dt, 0, world);
      this.tryMove(0, this.knock.y * dt, world);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    } else this.knock.set(0, 0);

    const { x, z } = input.moveAxis();
    const moving = x !== 0 || z !== 0;
    const depth = this.cave ? 0 : world.terrain.waterDepth(this.position.x, this.position.z);
    this.swimming = depth > SWIM_DEPTH;
    // Wading slows you down the deeper you go; swimming is slower still.
    // Press C to crouch or stand back up, or hold Shift: slower, and animals don't notice you
    // as soon.
    if (input.wasPressed('KeyC')) this.crouched = !this.crouched;
    this.sneaking = (this.crouched || input.isDown('ShiftLeft', 'ShiftRight')) && !this.swimming;
    const aiming = this.busy === 'draw'; // drawing a bow: walk slowly, still facing the aim
    const landSpeed = this.sneaking || aiming ? SNEAK_SPEED : WALK_SPEED;
    let speed = THREE.MathUtils.lerp(landSpeed, SWIM_SPEED, Math.min(1, depth / SWIM_DEPTH));
    // How steep the ground underfoot is (not up on a rock or a floor, or in the water).
    const onGround = !this.cave && !this.airborne && this.standingHeight < 0.05 && depth === 0;
    const { x: rise, z: riseZ } = onGround ? world.terrain.slopeAt(this.position.x, this.position.z) : { x: 0, z: 0 };
    const groundBefore = this.position.y;
    const [fromX, fromZ] = [this.position.x, this.position.z];

    if (moving) {
      const way = new THREE.Vector2(x, z).normalize();
      // Steep ground slows you to a scramble the steeper it is uphill the way you're going.
      const uphill = Math.max(0, way.x * rise + way.y * riseZ);
      const steepness = THREE.MathUtils.smoothstep(uphill, Math.tan(STEEP_FROM), Math.tan(MAX_CLIMB));
      speed = THREE.MathUtils.lerp(speed, Math.min(speed, SCRAMBLE_SPEED), steepness);
      const step = way.multiplyScalar(speed * dt);
      // Move one axis at a time so the player slides along trees and the shore.
      this.tryMove(step.x, 0, world);
      this.tryMove(0, step.y, world);

      // Turn smoothly toward the direction of travel (unless aiming the bow).
      const target = aiming ? this.facing : Math.atan2(x, z);
      const diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += diff * Math.min(1, TURN_SPEED * dt);
      this.walkTime += dt;
    }
    // Underground you walk on the cave's floor; on the surface, the land (or swim).
    const ground = this.cave ? this.cave.floorAt(this.position.x, this.position.z) : world.terrain.heightAt(this.position.x, this.position.z);
    this.position.y = this.cave ? ground : Math.max(ground, world.terrain.waterLevelAt(this.position.x, this.position.z) - SWIM_DEPTH);
    // The ground fell away faster than a walk down even the steepest slope (a cliff edge): you
    // go over, falling from where your feet were. In the air, the body keeps its height
    // whatever the ground below does, so a jump or a fall carries on over dips and drops.
    const drop = groundBefore - this.position.y;
    const walkable = Math.hypot(this.position.x - fromX, this.position.z - fromZ) * Math.tan(CLIFF);
    const overTheEdge = !this.cave && !this.airborne && onGround && drop > walkable + 0.05;
    if (!this.cave && (this.airborne || overTheEdge)) this.jumpHeight += drop;
    if (overTheEdge) this.jumpSpeed = Math.min(this.jumpSpeed, -0.01); // falling (so the step-down below doesn't catch you)

    // Space to jump (not while swimming or wading deep). The jump only lifts the body:
    // `position` stays on the ground, so the camera doesn't bob.
    this.standingHeight = this.heightUnderfoot(world);
    // Standing on something (not mid-jump), follow it up, or down a step, so walking down
    // stairs doesn't turn into a string of little falls. Anything further down, you fall.
    if (this.jumpSpeed === 0 && this.jumpHeight - this.standingHeight <= STEP) this.jumpHeight = this.standingHeight;
    if (input.wasPressed('Space') && !this.airborne && depth < JUMP_MAX_DEPTH) this.jumpSpeed = JUMP_SPEED;
    if (this.jumpSpeed !== 0 || this.airborne) {
      this.jumpSpeed -= GRAVITY * dt;
      this.jumpHeight += this.jumpSpeed * dt;
      if (this.jumpHeight <= this.standingHeight) this.jumpSpeed = 0; // landed
    }
    if (this.jumpSpeed === 0 && this.jumpHeight <= this.standingHeight) this.jumpHeight = this.standingHeight;
    // How far you've come down, for fall damage: from the highest point in the air to where you land.
    if (this.airborne) this.fallFrom = Math.max(this.fallFrom ?? -Infinity, this.feet);
    else if (this.fallFrom !== null) {
      const fell = this.fallFrom - this.feet;
      if (fell > 0.25) {
        this.landTime = LAND_TIME;
        this.landHard = Math.min(1, fell / 2);
      }
      if (fell > SAFE_FALL && world.terrain.waterDepth(this.position.x, this.position.z) < 0.6) this.fallDamage += (fell - SAFE_FALL) * FALL_DAMAGE;
      this.fallFrom = null;
    }

    this.object.position.copy(this.position);
    this.object.position.y += this.jumpHeight;
    this.object.rotation.y = this.facing;
    if (this.mixer) {
      this.animate(dt, moving, speed);
      return;
    }
    const crouch = this.sneaking ? 0.75 : 1;
    this.body.scale.y += (crouch - this.body.scale.y) * Math.min(1, dt * 10);
    if (this.swimming) {
      // Bob gently in the water.
      this.body.position.y = Math.sin(performance.now() / 400) * 0.06;
    } else {
      // A little bounce while walking.
      this.body.position.y = moving ? Math.abs(Math.sin(this.walkTime * 10)) * (this.sneaking ? 0.03 : 0.08) : 0;
    }
  }

  // A point on the ground `distance` meters in front of the player.
  ahead(distance) {
    return {
      x: this.position.x + Math.sin(this.facing) * distance,
      z: this.position.z + Math.cos(this.facing) * distance,
    };
  }

  // True when standing in, or facing, water close enough to drink.
  canDrink(world) {
    if (this.cave) return false;
    const { x, z } = this.ahead(1.2);
    return (
      world.terrain.waterDepth(this.position.x, this.position.z) > 0.02 || world.terrain.waterDepth(x, z) > 0.02
    );
  }

  // The standing tree in front of the player, close enough to chop, if any.
  treeInReach(world) {
    const { x, z } = this.ahead(0.9);
    return world.trees.findTarget(x, z, 0.6);
  }

  die() {
    this.alive = false;
  }

  reset() {
    this.alive = true;
    this.cave = null;
    this.position.copy(this.spawn);
    this.facing = this.spawnFacing;
    this.jumpHeight = this.jumpSpeed = this.standingHeight = 0;
    this.fallFrom = null;
    this.fallDamage = 0;
    this.crouched = false;
    this.body.rotation.x = 0;
    this.hurtTime = 0;
    this.knock.set(0, 0);
    this.pose = null;
    this.poseWeight = 0;
  }

  // How high above the ground the feet can rest here: the top of the highest rock or stump
  // they've cleared, or 0.
  heightUnderfoot(world) {
    const feet = this.position.y + this.jumpHeight;
    let top = this.position.y;
    for (const o of world.obstacles.near(this.position.x, this.position.z, TOP_OVERHANG)) {
      if (o.top === undefined || o.top > feet + Math.max(TOP_MARGIN, this.airborne ? 0 : STEP_OVER)) continue;
      if (Math.hypot(o.x - this.position.x, o.z - this.position.z) < o.radius + TOP_OVERHANG) top = Math.max(top, o.top);
    }
    // Floors in buildings (stairs, landings, the lookout's cab) you can step up onto.
    for (const structure of world.structures) {
      top = Math.max(top, structure.floorAt(this.position.x, this.position.z, feet + STEP));
    }
    return top - this.position.y;
  }

  // The height the player's feet are at (on a floor or a rock, or in the air).
  get feet() {
    return this.position.y + this.jumpHeight;
  }

  // The height of what the player is standing on (ignoring jumps), for the camera.
  get standingOn() {
    return this.position.y + this.standingHeight;
  }

  tryMove(dx, dz, world) {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const x = THREE.MathUtils.clamp(this.position.x + dx, minX + 1, maxX - 1);
    const z = THREE.MathUtils.clamp(this.position.z + dz, minZ + 1, maxZ - 1);
    if (this.cave) {
      // Underground: the cave's own walls (you can always move out of one, in case).
      if (this.cave.blocked(x, z) && !this.cave.blocked(this.position.x, this.position.z)) return;
      this.position.x = x;
      this.position.z = z;
      return;
    }
    // Ground too steep to walk up (see MAX_CLIMB) stops you, jumping or not, unless you're
    // up on a rock or a floor.
    if (this.standingHeight < 0.05) {
      world.terrain.turnedBack = null;
      if (!world.terrain.canClimb(x, z, dx, dz)) {
        this.turnedBack = world.terrain.turnedBack; // (why: the sea, the lake or the mountainside, if one of those)
        return;
      }
    }
    const feet = this.position.y + this.jumpHeight;
    for (const o of world.obstacles.near(x, z, RADIUS)) {
      if (o.top !== undefined && feet >= o.top - STEP_OVER) continue; // high enough to pass over it, or low enough to step up onto
      if (o.below !== undefined && feet >= o.below) continue; // only in the way lower down (the tower's legs)
      if (o.above !== undefined && feet < o.above) continue; // only in the way higher up (the cab's walls)
      const distance = Math.hypot(o.x - x, o.z - z);
      // Moving away is always allowed, so landing against something can't trap the player.
      if (distance < o.radius + RADIUS && distance < Math.hypot(o.x - this.position.x, o.z - this.position.z)) return;
    }
    this.position.x = x;
    this.position.z = z;
  }
}
