import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
// Vite serves public/ at the site root; a plain web server serves it at /public/.
const MODEL_FOLDERS = ['models/', 'public/models/'];

// Loads public/models/<name>.glb. Resolves to the model, or null if there isn't one yet.
export function loadModel(name, folders = MODEL_FOLDERS) {
  if (folders.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    loader.load(
      folders[0] + name + '.glb',
      (gltf) => resolve(gltf.scene),
      undefined,
      () => resolve(loadModel(name, folders.slice(1))),
    );
  });
}

// Draws many copies of a model cheaply: one InstancedMesh per mesh in the model.
// `transforms` holds one Matrix4 (position/rotation/scale) per copy.
export function createInstances(template, transforms) {
  const group = new THREE.Group();
  template.updateMatrixWorld(true);
  template.traverse((child) => {
    if (!child.isMesh) return;
    const instances = new THREE.InstancedMesh(child.geometry, child.material, transforms.length);
    const matrix = new THREE.Matrix4();
    transforms.forEach((transform, i) => {
      instances.setMatrixAt(i, matrix.multiplyMatrices(transform, child.matrixWorld));
    });
    instances.castShadow = true;
    instances.receiveShadow = true;
    group.add(instances);
  });
  return group;
}

// Shows `placeholder` copies right away, then swaps in the Blender model once it loads.
export function instancedModel(name, placeholder, transforms) {
  const holder = new THREE.Group();
  holder.add(createInstances(placeholder, transforms));
  loadModel(name).then((model) => {
    if (!model) return;
    holder.clear();
    holder.add(createInstances(model, transforms));
  });
  return holder;
}
