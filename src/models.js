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
// `changeMaterial`, if given, swaps each material for a modified one.
export function createInstances(template, transforms, changeMaterial) {
  const group = new THREE.Group();
  template.updateMatrixWorld(true);
  template.traverse((child) => {
    if (!child.isMesh) return;
    const material = changeMaterial
      ? Array.isArray(child.material)
        ? child.material.map(changeMaterial)
        : changeMaterial(child.material)
      : child.material;
    const instances = new THREE.InstancedMesh(child.geometry, material, transforms.length);
    const matrix = new THREE.Matrix4();
    transforms.forEach((transform, i) => {
      instances.setMatrixAt(i, matrix.multiplyMatrices(transform, child.matrixWorld));
    });
    instances.castShadow = true;
    instances.receiveShadow = true;
    // Copies are spread across the whole map and can move, so don't let three.js skip drawing them.
    instances.frustumCulled = false;
    instances.userData.local = child.matrixWorld.clone();
    group.add(instances);
  });
  return group;
}

// Shows `placeholder` copies right away, then swaps in the Blender model once it loads.
// Call `holder.setInstance(i, matrix)` to move, rotate or hide (scale 0) one copy.
export function instancedModel(name, placeholder, transforms, changeMaterial) {
  const holder = new THREE.Group();
  holder.add(createInstances(placeholder, transforms, changeMaterial));
  loadModel(name).then((model) => {
    if (!model) return;
    holder.clear();
    holder.add(createInstances(model, transforms, changeMaterial));
  });

  const matrix = new THREE.Matrix4();
  holder.setInstance = (i, transform) => {
    transforms[i] = transform.clone();
    holder.traverse((child) => {
      if (!child.isInstancedMesh) return;
      child.setMatrixAt(i, matrix.multiplyMatrices(transform, child.userData.local));
      child.instanceMatrix.needsUpdate = true;
    });
  };
  return holder;
}

// A transform that hides a copy.
export const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
