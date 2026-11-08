import * as THREE from 'three';
import { CRASH as PLANE, trailPoint } from './crashTrail.js';
import { instancedModel, loadModel, swappable } from './models.js';
import * as placeholders from './placeholders.js';

// Where the plane came down: around (0, 0), in a clearing. The player starts about 20 m
// south of it (see SPAWN in world.js), facing it but just out of view.
const WING = { x: -5.5, z: -9, heading: 2.2 }; // the wing that broke off
const WING_TOP = 0.45; // how high the wing lies off the ground, for hopping onto it
// Things to search around the crash (hold E). Each can be searched once, and always
// holds the same supplies.
const SUITCASES = [
  // Thrown out as the plane skidded in, lying in the furrow it dug.
  { ...trailPoint(17, 0.4), heading: 2.2, color: 0x4f5b3a, loot: [['lighter', 1], ['flare', 1]] },
  // The rest lie out in the open, clear of the plane and its wings (which hide anything
  // under them from the camera), a few meters off the nose, the left wingtip and the tail.
  { x: 6.2, z: 0.2, heading: 0.3, color: 0x6b4a32, loot: [['bandage', 3], ['rope', 2]], note: 'a first-aid kit' },
  // Your own luggage: your jacket (you come to in just a shirt, and it's cold)...
  { x: -7.5, z: -2.5, heading: 2.4, color: 0x3d5a78, loot: [['jacket', 1], ['rope', 2]], note: 'your jacket' },
  // ...and the pilot's bag, with a compass.
  { x: 0, z: -15, heading: 1.1, color: 0x7a2f2f, loot: [['compass', 1], ['rope', 1]], note: 'a compass' },
];
const CLODS = 46;
// Where the starting items lie around the wreckage.
export const START_ITEMS = [
  { item: 'axe', x: -3.6, z: -6.8 },
  { item: 'backpack', x: 2.8, z: -3.2 },
];

// The wreck up close: grime and mud thrown up from the ground (darker the lower it is), and
// mottled dirt and scuffs over the paint, so the plane's big flat faces don't look like a
// fresh toy. Height above the ground is measured from the model's lowest point, found on its
// first frame (once it's been put in place).
const GRIME = { height: 1.1, mottle: 0.22, scale: 2.3 };
function weather(model) {
  const floor = { value: 0 };
  let measured = false;
  model.traverse((child) => {
    if (!child.isMesh || child.material.name.startsWith('glass')) return; // (the windows stay clear)
    const material = child.material.clone();
    material.roughness = Math.max(material.roughness ?? 1, 0.85);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFloor = floor;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vLocal;
          uniform float uFloor;
          float grimeHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
          float grimeNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(grimeHash(i), grimeHash(i + vec2(1, 0)), f.x), mix(grimeHash(i + vec2(0, 1)), grimeHash(i + vec2(1, 1)), f.x), f.y);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float above = vLocal.y - uFloor;
          float mud = 1.0 - smoothstep(0.0, ${GRIME.height.toFixed(2)}, above);
          float mottle = grimeNoise(vLocal.xz * ${GRIME.scale.toFixed(1)} + vLocal.y * 1.7) * 0.6 + grimeNoise(vLocal.xz * ${(GRIME.scale * 4).toFixed(1)}) * 0.4;
          vec3 dirt = vec3(0.22, 0.18, 0.13);
          diffuseColor.rgb = mix(diffuseColor.rgb, dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) * vec3(1.0), 0.18);
          diffuseColor.rgb *= 1.0 - ${GRIME.mottle.toFixed(2)} * mottle;
          diffuseColor.rgb = mix(diffuseColor.rgb, dirt, mud * 0.7);`);
    };
    child.material = material;
    child.onBeforeRender = () => {
      if (measured) return;
      measured = true;
      floor.value = new THREE.Box3().setFromObject(model).min.y;
    };
  });
}

// The crashed bush plane at the start: the plane, its broken-off wing, a few
// scattered bits of debris and a wisp of smoke from the engine.
export function buildWreck(scene, world) {
  const place = (object, { x, z, heading }) => {
    object.position.set(x, world.terrain.heightAt(x, z), z);
    object.rotation.y = heading;
    scene.add(object);
  };

  // Shows the stand-in right away, then swaps in the Blender model once it loads.
  const withModel = (name, placeholder, prepare) => {
    const holder = new THREE.Group();
    holder.add(placeholder);
    loadModel(name).then((model) => {
      if (!model) return;
      model.traverse((child) => {
        child.castShadow = child.receiveShadow = true;
        if (child.isMesh && child.material.name?.startsWith('glass')) child.castShadow = false; // (light comes through the windows)
      });
      prepare?.(model);
      holder.clear();
      holder.add(model);
    });
    return holder;
  };

  // Each suitcase shares one model, tinted its own colour, with a lid that hinges open.
  const withSuitcaseModel = (color) => {
    const placeholder = placeholders.suitcase(color);
    const holder = withModel('suitcase', placeholder, (model) => {
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.material = child.material.clone();
        child.material.color.set(color);
      });
      const lid = model.getObjectByName('lid');
      lid.rotation.copy(holder.userData.lid.rotation);
      holder.userData.lid = lid;
    });
    holder.userData.lid = placeholder.userData.lid;
    return holder;
  };

  place(withModel('plane', placeholders.crashedPlane(), weather), PLANE);
  place(withModel('plane-wing', placeholders.brokenWing(), weather), WING);
  for (const [x, z, heading] of [[3.5, -8.5, 0.4], [-1.8, -2.4, 2.1], [4.6, -5, 1.2]]) {
    place(swappable('debris', placeholders.debris()), { x, z, heading });
  }

  // Scraps and a landing wheel shed along the skid: [meters behind the plane, meters off the trail].
  for (const [back, side] of [[9, 2.8], [15, -3.1], [21, 3.4], [25, -2.6], [34, 2.2]]) {
    place(swappable('debris', placeholders.debris()), { ...trailPoint(back, side), heading: back });
  }
  place(swappable('landing-wheel', placeholders.landingWheel()), { ...trailPoint(29, 3.4), heading: 1.1 });

  // Clods of soil thrown out along both sides of the skid.
  const clods = [];
  for (let i = 0; i < CLODS; i++) {
    const back = (i / CLODS) * 36;
    const side = (i % 2 ? 1 : -1) * (2 + Math.abs(Math.sin(i * 12.9)) * 1.8);
    const { x, z } = trailPoint(back, side);
    const size = 0.5 + Math.abs(Math.sin(i * 7.3)) * 1.2;
    clods.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, world.terrain.heightAt(x, z), z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i, i * 2.4, i * 1.3)),
      new THREE.Vector3(size, size * 0.7, size),
    ));
  }
  scene.add(instancedModel('clod', placeholders.clod(), clods));

  // The plane blocks the player: a row of circles along the body, plus the wing.
  const along = new THREE.Vector2(Math.sin(PLANE.heading), Math.cos(PLANE.heading));

  // Searchable spots: suitcases thrown out in the crash.
  const containers = [];
  for (const suitcase of SUITCASES) {
    const object = withSuitcaseModel(suitcase.color);
    place(object, suitcase);
    world.obstacles.add({ x: suitcase.x, z: suitcase.z, radius: 0.4 });
    containers.push({ ...suitcase, label: 'the suitcase', object });
  }
  for (let d = -3; d <= 3; d += 1.5) {
    world.obstacles.add({ x: PLANE.x + along.x * d, z: PLANE.z + along.y * d, radius: 1 });
  }
  // The wing: a row of circles along its length (it's about 5.8 m long and 1.6 m wide), low
  // enough to hop up onto and walk along.
  const span = new THREE.Vector2(Math.cos(WING.heading), -Math.sin(WING.heading)); // its local +x
  for (let d = -2.4; d <= 2.2; d += 0.75) {
    const x = WING.x + span.x * d;
    const z = WING.z + span.y * d;
    world.obstacles.add({ x, z, radius: 0.75, top: world.terrain.heightAt(x, z) + WING_TOP });
  }

  // The crash flattened the grass.
  world.grass.clear(PLANE.x, PLANE.z, 6);
  world.grass.clear(WING.x, WING.z, 3);

  const enginePosition = new THREE.Vector3(PLANE.x + along.x * 3.3, 0, PLANE.z + along.y * 3.3);
  enginePosition.y = world.terrain.heightAt(enginePosition.x, enginePosition.z) + 0.8;
  const smoke = new Smoke(scene, enginePosition);

  const setOpen = (container, open) => {
    container.searched = open;
    if (container.object) container.object.userData.lid.rotation.x = open ? -1.9 : 0;
  };

  return {
    update: (dt) => smoke.update(dt),
    // The searchable spot nearest to (x, z), if one is within `reach`.
    near(x, z, reach) {
      let best = null;
      let bestDistance = reach;
      for (const container of containers) {
        const distance = Math.hypot(container.x - x, container.z - z);
        if (distance < bestDistance) {
          best = container;
          bestDistance = distance;
        }
      }
      return best;
    },
    // Marks it searched (suitcases flip open) and returns what was inside.
    search(container) {
      setOpen(container, true);
      return container.loot;
    },
    // Closes everything up again, for a new game.
    reset() {
      for (const container of containers) setOpen(container, false);
    },
  };
}

const PUFFS = 40;

// Thin grey smoke drifting up from the engine.
class Smoke {
  constructor(scene, origin) {
    this.origin = origin;
    this.ages = Array.from({ length: PUFFS }, (_, i) => (i / PUFFS) * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PUFFS * 3), 3));
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x5a5a5a,
        size: 1.4,
        map: softDot(),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.update(0);
  }

  update(dt) {
    const positions = this.points.geometry.attributes.position;
    for (let i = 0; i < PUFFS; i++) {
      this.ages[i] = (this.ages[i] + dt) % 6; // each puff rises for 6 seconds, then starts again
      const age = this.ages[i];
      positions.setXYZ(
        i,
        this.origin.x + Math.sin(i * 2.4) * 0.2 + age * 0.35, // drifts a little downwind
        this.origin.y + age * 1.1,
        this.origin.z + Math.cos(i * 1.7) * 0.2,
      );
    }
    positions.needsUpdate = true;
  }
}

function softDot() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
