import * as THREE from 'three';
import * as placeholders from './placeholders.js';

// Inventory icons: each item is a tiny low-poly model, rendered once into a picture when the
// game loads, so the icons match the look of the game. Change a model below to change its icon.

const SIZE = 128; // pixels (drawn at 2x, so they're crisp on high-res screens)

const flat = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
const glow = (color) => new THREE.MeshBasicMaterial({ color });

const BARK = flat(0x6b4a32);
const CUT_WOOD = flat(0xd9b98a);
const STEEL = flat(0x9aa3ab, 0.45);
const DARK_STEEL = flat(0x5d646b, 0.5);
const STONE = flat(0x8a8880);
const WHITE = flat(0xf1ece2);
const FLAME_OUTER = glow(0xff7a2a);
const FLAME_INNER = glow(0xffd36a);

const mesh = (geometry, material, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
};
const group = (...children) => {
  const g = new THREE.Group();
  g.add(...children);
  return g;
};

// A small two-layer flame, base at the origin.
const flame = (scale = 1) =>
  group(
    mesh(new THREE.ConeGeometry(0.22 * scale, 0.6 * scale, 5).translate(0, 0.3 * scale, 0), FLAME_OUTER),
    mesh(new THREE.ConeGeometry(0.12 * scale, 0.38 * scale, 5).translate(0, 0.19 * scale, 0), FLAME_INNER, [0, 0, 0.05 * scale]),
  );

// A log lying along x, with light cut ends.
const log = (length, radius, position, rotation) =>
  group(
    mesh(new THREE.CylinderGeometry(radius, radius, length, 7), BARK, [0, 0, 0], [0, 0, Math.PI / 2]),
    mesh(new THREE.CircleGeometry(radius * 0.92, 7), CUT_WOOD, [length / 2 + 0.002, 0, 0], [0, Math.PI / 2, 0]),
    mesh(new THREE.CircleGeometry(radius * 0.92, 7), CUT_WOOD, [-length / 2 - 0.002, 0, 0], [0, -Math.PI / 2, 0]),
  ).translateX(position[0]).translateY(position[1]).translateZ(position[2]).rotateY(rotation);

const MODELS = {
  axe: () => {
    const handle = mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), flat(0x9a7046), [0, 0, 0]);
    const blade = mesh(new THREE.BoxGeometry(0.6, 0.46, 0.14), STEEL, [0.24, 0.55, 0]);
    const edge = mesh(new THREE.BoxGeometry(0.1, 0.6, 0.08), flat(0xd6dde3, 0.3), [0.57, 0.55, 0]);
    const poll = mesh(new THREE.BoxGeometry(0.22, 0.24, 0.16), DARK_STEEL, [-0.12, 0.55, 0]);
    return group(handle, blade, edge, poll).rotateZ(-0.75);
  },

  wood: () =>
    group(
      log(1.2, 0.2, [0, 0, 0.22], 0),
      log(1.2, 0.2, [0, 0, -0.22], 0),
      log(1.2, 0.2, [0.05, 0.34, 0], 0),
    ).rotateY(-0.7), // turned so the cut ends face you

  trap: () => {
    const wood = flat(0x8a6a45);
    const base = mesh(new THREE.BoxGeometry(1.1, 0.08, 0.7), wood, [0, 0.04, 0]);
    const stakes = [-0.45, 0.45].map((x) => mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 5), wood, [x, 0.4, 0]));
    const bar = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), wood, [0, 0.72, 0], [0, 0, Math.PI / 2]);
    const loop = mesh(new THREE.TorusGeometry(0.22, 0.02, 4, 10), STEEL, [0, 0.38, 0]);
    const string = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 3), STEEL, [0, 0.66, 0]);
    return group(base, ...stakes, bar, loop, string);
  },

  campfire: () => {
    const stones = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      stones.push(mesh(new THREE.DodecahedronGeometry(0.17, 0), STONE, [Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6], [a, a * 2, 0]));
    }
    const logs = [0, 1, 2].map((i) =>
      mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 6), BARK, [0, 0.2, 0], [Math.PI / 2 - 0.45, (i / 3) * Math.PI * 2, 0]),
    );
    logs.forEach((l) => (l.rotation.order = 'YXZ'));
    return group(...stones, ...logs, flame(1.3).translateY(0.12));
  },

  lighter: () => {
    const body = mesh(new THREE.BoxGeometry(0.42, 0.7, 0.2), flat(0xc0392b, 0.5), [0, 0.35, 0]);
    const top = mesh(new THREE.BoxGeometry(0.42, 0.2, 0.2), STEEL, [0, 0.8, 0]);
    const wheel = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 6), DARK_STEEL, [-0.08, 0.94, 0], [Math.PI / 2, 0, 0]);
    return group(body, top, wheel, flame(0.7).translateX(0.08).translateY(0.9)).rotateZ(-0.2);
  },

  flare: () => {
    const tube = mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.2, 7), flat(0xd8342a, 0.55), [0, 0, 0]);
    const band = mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.16, 7), WHITE, [0, 0.25, 0]);
    const cap = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 7), flat(0x2f2a28), [0, 0.68, 0]);
    const tip = mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 6), flat(0x6a5240), [0, -0.66, 0]);
    return group(tube, band, cap, tip).rotateZ(-0.8);
  },

  bandage: () => {
    const roll = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.36, 9), WHITE, [0, 0.18, 0]);
    const core = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.37, 7), flat(0xb9b0a0), [0, 0.18, 0]);
    // The loose end, unrolling across the ground.
    const tail = mesh(new THREE.BoxGeometry(0.7, 0.03, 0.34), WHITE, [0.65, 0.02, 0.02], [0, 0, 0.05]);
    const cross = group(
      mesh(new THREE.BoxGeometry(0.2, 0.012, 0.06), flat(0xc0392b), [0.7, 0.045, 0.02]),
      mesh(new THREE.BoxGeometry(0.06, 0.012, 0.2), flat(0xc0392b), [0.7, 0.045, 0.02]),
    );
    return group(roll, core, tail, cross);
  },

  rope: () => {
    const hemp = flat(0xc7a46a);
    const loops = [0, 1, 2].map((i) =>
      mesh(new THREE.TorusGeometry(0.45 - i * 0.04, 0.07, 4, 12), hemp, [0, 0.07 + i * 0.1, 0], [Math.PI / 2, 0, i * 0.7]),
    );
    const end = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 4), hemp, [0.55, 0.06, 0.25], [0, 0.6, Math.PI / 2]);
    return group(...loops, end);
  },

  rawMeat: () => {
    const steak = mesh(new THREE.DodecahedronGeometry(0.5, 0).scale(1.2, 0.35, 0.85), flat(0xc0474a), [0, 0.18, 0]);
    const fat = mesh(new THREE.DodecahedronGeometry(0.5, 0).scale(1.27, 0.3, 0.9), flat(0xf0d6c6), [0, 0.15, 0]);
    const bone = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 6), WHITE, [0.15, 0.3, 0], [Math.PI / 2, 0, 0]);
    return group(fat, steak, bone);
  },

  cookedMeat: () => {
    const meat = mesh(new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.85, 1.3), flat(0x8a4a24), [0, 0, -0.2]);
    const bone = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.35, 6), WHITE, [0, 0, 0.55], [Math.PI / 2, 0, 0]);
    const knobs = [-0.08, 0.08].map((x) => mesh(new THREE.DodecahedronGeometry(0.1, 0), WHITE, [x, 0, 0.74]));
    return group(meat, bone, ...knobs).rotateY(0.9).rotateX(-0.3);
  },

  // A folded, furry rabbit/deer pelt.
  hide: () => {
    const fur = flat(0x9a7a58);
    const skin = flat(0xcfae86);
    const pelt = new THREE.BoxGeometry(1.2, 0.08, 0.85, 3, 1, 2);
    const p = pelt.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // Ragged edges and a slight sag, so it reads as a skin rather than a board.
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, p.getY(i) - (x * x) * 0.12 + Math.sin(x * 7 + z * 5) * 0.02);
      p.setZ(i, z * (1 + 0.12 * Math.sin(x * 9)));
    }
    pelt.computeVertexNormals();
    const top = mesh(pelt, fur, [0, 0.12, 0]);
    const under = mesh(new THREE.BoxGeometry(1.1, 0.05, 0.7), skin, [0.05, 0.03, 0.08], [0, 0.15, 0]);
    const legs = [[-0.62, -0.32], [-0.62, 0.32], [0.62, -0.3], [0.62, 0.3]].map(([x, z]) =>
      mesh(new THREE.BoxGeometry(0.22, 0.05, 0.14), fur, [x, 0.12, z], [0, x * z > 0 ? 0.5 : -0.5, 0]),
    );
    return group(under, top, ...legs);
  },

  // A coil of intestines, for drying into cord.
  gut: () => {
    const pink = flat(0xc98a8a);
    const loops = [0, 1].map((i) =>
      mesh(new THREE.TorusGeometry(0.32 - i * 0.1, 0.09, 5, 9), pink, [0.05 * i, 0.09 + i * 0.13, 0], [Math.PI / 2, 0, i]),
    );
    const tail = mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.55, 5), flat(0xb87878), [0.45, 0.06, 0.15], [0, 0.4, Math.PI / 2]);
    return group(...loops, tail);
  },

  stone: () => mesh(new THREE.DodecahedronGeometry(0.4, 0).scale(1, 0.65, 0.85), STONE, [0, 0.26, 0], [0.2, 0.5, 0]),

  bowstring: () => {
    const cord = flat(0xe8dcc0);
    const loops = [0, 1, 2].map((i) => mesh(new THREE.TorusGeometry(0.34, 0.03, 4, 14), cord, [0, 0.05 + i * 0.05, 0], [Math.PI / 2, 0, i * 0.4]));
    return group(...loops);
  },

  bow: () => group(placeholders.bow()).rotateZ(-0.7),

  arrow: () => {
    const arrows = [-0.12, 0, 0.12].map((x) => {
      const a = placeholders.arrow();
      a.position.x = x;
      a.scale.setScalar(1.3);
      return a;
    });
    return group(...arrows).rotateY(Math.PI / 4).rotateX(-0.4);
  },

  // A leather water flask with a wooden stopper and a carrying cord.
  flask: () => {
    const leather = flat(0x7a5236);
    const body = mesh(new THREE.DodecahedronGeometry(0.42, 0).scale(1, 1.15, 0.6), leather, [0, 0.45, 0]);
    const neck = mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.2, 6), flat(0x5e3e28), [0, 0.98, 0]);
    const stopper = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 6), flat(0xc9a46a), [0, 1.14, 0]);
    const cord = mesh(new THREE.TorusGeometry(0.42, 0.025, 3, 12, Math.PI * 1.2), flat(0xc7a46a), [0, 0.62, 0], [0, 0, Math.PI * 0.4]);
    const stitch = mesh(new THREE.BoxGeometry(0.03, 0.75, 0.27), flat(0xd8c49a), [0, 0.45, 0]);
    return group(body, stitch, neck, stopper, cord);
  },

  shelter: () => placeholders.shelter().rotateY(0.5),

  // The red coat the player wears (shown in the character panel's Outfit slot).
  outfit: () => {
    const red = flat(0xb5432f);
    const dark = flat(0x8a3324);
    const body = mesh(new THREE.BoxGeometry(0.8, 1, 0.4), red, [0, 0.5, 0]);
    const sleeves = [-1, 1].map((s) => mesh(new THREE.BoxGeometry(0.22, 0.85, 0.26), dark, [s * 0.52, 0.55, 0], [0, 0, s * 0.12]));
    const hood = mesh(new THREE.BoxGeometry(0.5, 0.2, 0.36), flat(0x6b4a32), [0, 1.08, -0.02]);
    const zip = mesh(new THREE.BoxGeometry(0.04, 0.9, 0.02), flat(0x3a2a20), [0, 0.5, 0.21]);
    const pockets = [-1, 1].map((s) => mesh(new THREE.BoxGeometry(0.22, 0.16, 0.03), dark, [s * 0.2, 0.28, 0.21]));
    return group(body, ...sleeves, hood, zip, ...pockets);
  },

  backpack: () => {
    const canvas = flat(0x4f6b45);
    const darker = flat(0x3f5737);
    const bag = mesh(new THREE.BoxGeometry(0.75, 0.95, 0.42), canvas, [0, 0.48, 0]);
    const flap = mesh(new THREE.BoxGeometry(0.78, 0.3, 0.46), darker, [0, 0.86, 0.01]);
    const pocket = mesh(new THREE.BoxGeometry(0.5, 0.32, 0.12), darker, [0, 0.32, 0.26]);
    const roll = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.82, 7), flat(0x8a3a2a), [0, 1.08, 0], [0, 0, Math.PI / 2]);
    const straps = [-0.22, 0.22].map((x) => mesh(new THREE.BoxGeometry(0.08, 0.7, 0.04), flat(0x2f3a28), [x, 0.5, 0.23]));
    return group(bag, flap, pocket, roll, ...straps);
  },
};

const icons = renderAll();

// The icon picture for an item, as an image URL (for the HUD).
export function itemIconUrl(item) {
  return icons[item]?.url ?? '';
}

// The icon picture for an item, as a canvas (for drawing into other canvases).
export function itemIconCanvas(item) {
  return icons[item]?.canvas;
}

// Shows `item`'s icon on an element (or clears it with null). Does nothing if it already shows it.
export function showItemIcon(element, item) {
  const key = item ?? '';
  if (element.dataset.item === key) return;
  element.dataset.item = key;
  element.style.backgroundImage = item ? `url(${itemIconUrl(item)})` : '';
}

function renderAll() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeef2ff, 0x5c5446, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);

  const result = {};
  for (const [item, build] of Object.entries(MODELS)) {
    const model = build();
    scene.add(model);
    // Frame the model: look at it from slightly above and in front, filling the picture.
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.02;
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.35, 0.75, 1).normalize().multiplyScalar(distance));
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE * 2;
    canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
    result[item] = { canvas, url: canvas.toDataURL('image/png') };
    scene.remove(model);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return result;
}
