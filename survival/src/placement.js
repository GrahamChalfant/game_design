import * as THREE from 'three';
import { loadModel } from './models.js';
import * as placeholders from './placeholders.js';

// The things you put down on the ground from your hand, and for each: the model it's shown
// with, the stand-in until that loads, how far ahead of you it goes (nearest and furthest, in
// meters: aim nearer or further and it stops there), and how long you hold to build it.
export const PLACEABLES = {
  campfire: { model: 'campfire', placeholder: placeholders.campfire, near: 1.2, far: 4, buildTime: 2 },
  shelter: { model: 'shelter', placeholder: placeholders.shelter, near: 2.8, far: 5.5, buildTime: 4 },
  trap: { model: 'trap', placeholder: placeholders.trap, near: 0.9, far: 3, buildTime: 1.5 },
};

const CLEAR = 0xffffff; // the ghost where it can go...
const BLOCKED = 0xff4a3a; // ...and where it can't
const OPACITY = 0.38;
const BUILT_OPACITY = 0.75; // (it firms up as you build it)

// The see-through silhouette ("ghost") of a placeable, shown on the ground where it will go
// before you build it. White where it can go, red where it can't.
export class PlacementGhost {
  constructor(scene) {
    this.scene = scene;
    this.ghosts = {}; // one per item, made the first time it's needed
    this.shown = null;
    this.material = new THREE.MeshBasicMaterial({ color: CLEAR, transparent: true, opacity: OPACITY, depthWrite: false });
  }

  // Makes the ghost of `item` out of its model (its stand-in until that loads), every part of
  // it in the ghost's one see-through material.
  ghostOf(item) {
    if (this.ghosts[item]) return this.ghosts[item];
    const { model, placeholder } = PLACEABLES[item];
    const group = new THREE.Group();
    const dress = (object) => {
      object.traverse((child) => {
        if (!child.isMesh) return;
        child.material = this.material;
        child.castShadow = child.receiveShadow = false;
        child.renderOrder = 10;
      });
      group.clear();
      group.add(object);
    };
    dress(placeholder());
    loadModel(model).then((loaded) => loaded && dress(loaded));
    group.visible = false;
    this.scene.add(group);
    this.ghosts[item] = group;
    return group;
  }

  // Shows the ghost of `item` at `spot` ({ x, y, z }, on the ground), turned to `heading`;
  // `ok`: whether it can go there. `built` (0 to 1): how far along building it you are.
  show(item, spot, heading, ok, built = 0) {
    if (this.shown && this.shown !== item) this.hide();
    const ghost = this.ghostOf(item);
    ghost.position.set(spot.x, spot.y, spot.z);
    ghost.rotation.y = heading;
    ghost.visible = true;
    this.material.color.setHex(ok ? CLEAR : BLOCKED);
    this.material.opacity = OPACITY + (BUILT_OPACITY - OPACITY) * built;
    this.shown = item;
  }

  hide() {
    if (this.shown) this.ghosts[this.shown].visible = false;
    this.shown = null;
  }
}
