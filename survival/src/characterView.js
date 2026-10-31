import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const TURN_SPEED = 0.35; // radians a second
const WIDTH = 200; // the canvas's size in pixels, before the screen's pixel ratio
const HEIGHT = 250;

// The slowly turning close-up of your character in the inventory, drawn on its own canvas.
export class CharacterView {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(WIDTH, HEIGHT, false);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6458, 2));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    sun.position.set(1.5, 3, 3);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 20);
    this.camera.position.set(0, 1.45, 2.3);
    this.camera.lookAt(0, 1.25, 0);

    this.character = placeholders.survivor();
    this.turntable = new THREE.Group();
    this.turntable.rotation.y = 0.4;
    this.turntable.add(this.character);
    this.scene.add(this.turntable);

    loadModel('player').then((model) => {
      if (!model) return;
      model.traverse((child) => (child.frustumCulled = false));
      this.turntable.clear();
      this.turntable.add(model);
      this.character = model;
      this.mixer = new THREE.AnimationMixer(model);
      this.mixer.clipAction(model.animations.find((clip) => clip.name === 'idle')).play();
    });
  }

  update(dt, hasBackpack) {
    this.character.getObjectByName('player-pack').visible = hasBackpack;
    this.turntable.rotation.y += TURN_SPEED * dt;
    this.mixer?.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
