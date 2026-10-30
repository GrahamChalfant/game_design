import * as THREE from 'three';
import { Input } from './input.js';
import { buildLevel } from './level.js';
import { Player } from './player.js';

// --- Renderer, scene, camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e8);
scene.fog = new THREE.Fog(0x87b8e8, 30, 80);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Lighting ---
scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
scene.add(sun);

// --- Game objects ---
const input = new Input(renderer.domElement);
const level = buildLevel(scene);
const player = new Player(scene, level.spawn);

const scoreEl = document.getElementById('score');
const messageEl = document.getElementById('message');
let collected = 0;
let won = false;
const updateScore = () => (scoreEl.textContent = `Coins: ${collected} / ${level.coins.length}`);
updateScore();

// --- Third-person camera ---
let cameraYaw = 0;
let cameraPitch = 0.35;
const CAMERA_DISTANCE = 8;

function updateCamera() {
  cameraYaw -= input.dragX * 0.005;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + input.dragY * 0.005, 0.05, 1.2);
  const target = player.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  const offset = new THREE.Vector3(
    Math.sin(cameraYaw) * Math.cos(cameraPitch),
    Math.sin(cameraPitch),
    Math.cos(cameraYaw) * Math.cos(cameraPitch),
  ).multiplyScalar(CAMERA_DISTANCE);
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
}

// --- Main loop ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); // avoid huge jumps after a tab switch
  const time = clock.elapsedTime;

  player.update(dt, input, cameraYaw, level.platforms);

  for (const coin of level.coins) {
    if (!coin.visible) continue;
    coin.rotation.y = time * 2;
    const center = player.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    if (center.distanceTo(coin.position) < 1) {
      coin.visible = false;
      collected++;
      updateScore();
    }
  }

  if (!won && collected === level.coins.length) {
    won = true;
    messageEl.textContent = 'You collected every coin!';
    messageEl.hidden = false;
  }

  updateCamera();
  input.endFrame();
  renderer.render(scene, camera);
});
