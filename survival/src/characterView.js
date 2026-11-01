import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

const DRAG_TURN = 0.012; // radians the character turns per pixel dragged
const WIDTH = 200; // the canvas's size in pixels, before the screen's pixel ratio
const HEIGHT = 250;

// The close-up of your character in the inventory, drawn on its own canvas. The
// character faces you; click and drag to turn them around.
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

    let dragging = false;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (dragging) this.turntable.rotation.y += e.movementX * DRAG_TURN;
    });
    const stop = () => {
      dragging = false;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  // Turns the character back to face you (each time the inventory opens).
  faceForward() {
    this.turntable.rotation.y = 0;
  }

  update(dt, hasBackpack) {
    this.character.getObjectByName('player-pack').visible = hasBackpack;
    this.mixer?.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
