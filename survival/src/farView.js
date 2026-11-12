import * as THREE from 'three';
import { treeTint } from './trees.js';

// A rough, see-a-long-way version of the whole map: the ground in big 8 m squares and every
// tree as a simple shape. The game only draws the chunks near the player in full detail; this
// fills in the land beyond them when you can see that far: through the lookout's binoculars
// (#94), and in the third- and first-person views (see views.js). Inside the detailed chunks it
// isn't drawn at all (see `near`), so the two never overlap.
const CELL = 8; // meters per square of the rough ground
const BUDGET_MS = 2; // the most time per frame spent building it
const TREE_TILE = 192; // meters along each side of a tile of far trees
const SINK = 0.4; // sits this far below the real ground, so the seam with the detailed ground hides

// The far trees, by kind: how wide each is at its foot (meters, at scale 1: its model's own
// spread; its height is the model's too), its colour from far off (the model's greens, seen
// through its own shadows), and whether it's drawn in tiers (the grown spruce) or as one cone
// (the small ones, and dead trees: a bare grey spike). Saplings, knee to head high, aren't
// drawn from this far at all.
const GREEN = 0x62997c;
const SNOWY = 0xb4c8c4;
const FAR_TREES = {
  pine: { radius: 1.8, colour: GREEN, tiered: true },
  'pine-skinny': { radius: 1.0, colour: GREEN, tiered: true },
  'pine-tall': { radius: 2.3, colour: GREEN, tiered: true },
  'pine-wide': { radius: 2.3, colour: GREEN, tiered: true },
  'pine-snow': { radius: 1.7, colour: SNOWY, tiered: true },
  'pine-small': { radius: 1.0, colour: GREEN },
  'pine-small-snow': { radius: 1.0, colour: SNOWY },
  'tree-dead': { radius: 0.4, colour: 0x7a7167 },
};
const TIERS_TO = 800; // meters: past this a tile's spruce are plain cones
const SIDES = 7;

// A cone's side from a ring `radius` wide at height `foot` up to a point at `top`, shaded from
// `dark` at the ring (where a bough's underside is in shadow) to `light` at the point. Its
// normals are a round cone's, so it's lit softly, not in flat facets.
function coneSide(out, radius, foot, top, dark, light) {
  const slope = radius / (top - foot);
  const start = out.position.length / 3;
  for (let i = 0; i < SIDES; i++) {
    const a = (i / SIDES) * Math.PI * 2;
    const [x, z] = [Math.cos(a), Math.sin(a)];
    const length = Math.hypot(1, slope);
    out.position.push(x * radius, foot, z * radius);
    out.normal.push(x / length, slope / length, z / length);
    out.color.push(dark, dark, dark);
    // (A point of its own for each side, so the light turns round the tip too.)
    const m = a + Math.PI / SIDES;
    out.position.push(0, top, 0);
    out.normal.push(Math.cos(m) / length, slope / length, Math.sin(m) / length);
    out.color.push(light, light, light);
  }
  for (let i = 0; i < SIDES; i++) out.index.push(start + i * 2, start + i * 2 + 1, start + ((i + 1) % SIDES) * 2);
}
function shape(build) {
  const out = { position: [], normal: [], color: [], index: [] };
  build(out);
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) geometry.setAttribute(name, new THREE.Float32BufferAttribute(out[name], 3));
  geometry.setIndex(out.index);
  return geometry;
}
// One meter tall and one in radius: each tree scales it to its own size.
// A spruce: three skirts of boughs, each wider than the one above and overlapping it.
const spruceShape = () => shape((out) => {
  coneSide(out, 1, 0.1, 0.52, 0.62, 1);
  coneSide(out, 0.74, 0.36, 0.78, 0.66, 1.05);
  coneSide(out, 0.46, 0.62, 1, 0.7, 1.12);
});
const coneShape = () => shape((out) => coneSide(out, 0.9, 0.08, 1, 0.68, 1.08));

// The square of detailed chunks around the player, as (min x, min z, max x, max z): the rough
// ground and trees aren't drawn inside it.
const near = { value: new THREE.Vector4(1, 1, -1, -1) };

// Leaves out fragments (the ground) inside the detailed square.
function skipNearGround(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNear = near;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFarXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFarXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uNear;\nvarying vec2 vFarXZ;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (all(greaterThan(vFarXZ, uNear.xy)) && all(lessThan(vFarXZ, uNear.zw))) discard;`);
  };
  return material;
}

// Leaves out whole trees (instances) standing inside the detailed square.
function skipNearTrees(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNear = near;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uNear;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec2 rootXZ = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        if (all(greaterThan(rootXZ, uNear.xy)) && all(lessThan(rootXZ, uNear.zw))) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
  };
  return material;
}

export class FarView {
  constructor(scene, world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.building = this.build();
    this.treesBuilt = false;
    this.spotting = false;
    this.always = false;
  }

  // Keeps the rough view out of the square of detailed chunks round the player: `minX`… are
  // that square's edges in meters.
  setNear(minX, minZ, maxX, maxZ) {
    near.value.set(minX, minZ, maxX, maxZ);
  }

  // Shown all the time (for the views that look out across the land), or only while spotting.
  setAlways(on) {
    this.always = on;
    this.refresh();
  }

  // Builds a little more of the rough ground, for at most `budget` milliseconds. Call every
  // frame; it stops once it's done.
  update(budget = BUDGET_MS) {
    if (!this.building) return;
    const deadline = performance.now() + budget;
    while (performance.now() < deadline) {
      if (this.building.next().done) {
        this.building = null;
        return;
      }
    }
  }

  // While looking through the binoculars.
  show(on) {
    this.spotting = on;
    this.refresh();
  }

  refresh() {
    const on = this.spotting || this.always;
    if (on && !this.treesBuilt) this.buildTrees();
    this.group.visible = on;
  }

  // The rough ground: one mesh over the whole map, its colours blended smoothly between
  // corners (softer than up close, as things are from far away).
  *build() {
    const { terrain } = this.world;
    const { minX, maxX, minZ, maxZ } = this.world.bounds;
    const width = maxX - minX + 80;
    const depth = maxZ - minZ + 80;
    const geometry = new THREE.PlaneGeometry(width, depth, Math.round(width / CELL), Math.round(depth / CELL))
      .rotateX(-Math.PI / 2)
      .translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const shade = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      position.setY(i, terrain.heightAt(x, z) - SINK);
      const { color } = terrain.groundAt(x, z);
      shade.setRGB(color.r, color.g, color.b, THREE.SRGBColorSpace).toArray(colors, i * 3);
      if (i % 300 === 299) yield;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    yield;
    const ground = new THREE.Mesh(geometry, skipNearGround(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  // Every standing tree as a simple shape, the size and shade of the tree it stands for (see
  // FAR_TREES), so the forest looks the same wood from far off as it does close to.
  buildTrees() {
    this.treesBuilt = true;
    const spruce = spruceShape();
    const cone = coneShape();
    const material = skipNearTrees(new THREE.MeshLambertMaterial({ vertexColors: true }));
    // The trees go in square tiles, each its own meshes, so the camera skips the tiles behind
    // it and beyond its far edge (there are well over a hundred thousand trees). A tile's
    // grown spruce are drawn in tiers till they're too far off to tell, and as cones beyond.
    const tiles = new Map();
    for (const tree of this.world.trees.all) {
      const shape = FAR_TREES[tree.kind];
      if (!shape || tree.state !== 'standing') continue;
      const key = `${Math.floor(tree.spot.x / TREE_TILE)},${Math.floor(tree.spot.z / TREE_TILE)}`;
      if (!tiles.has(key)) tiles.set(key, { tiered: [], plain: [] });
      tiles.get(key)[shape.tiered ? 'tiered' : 'plain'].push(tree);
    }
    const matrix = new THREE.Matrix4();
    const size = new THREE.Vector3();
    const at = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const colour = new THREE.Color();
    const instances = (geometry, trees) => {
      if (!trees.length) return null;
      const mesh = new THREE.InstancedMesh(geometry, material, trees.length);
      trees.forEach((tree, i) => {
        const { x, y, z, scale, rotation } = tree.spot;
        const shape = FAR_TREES[tree.kind];
        size.set(shape.radius * scale, tree.height * scale, shape.radius * scale);
        mesh.setMatrixAt(i, matrix.compose(at.set(x, y, z), turn.setFromAxisAngle(up, rotation), size));
        mesh.setColorAt(i, colour.setHex(shape.colour).multiply(treeTint(tree.spot)));
      });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      return mesh;
    };
    // (Two meshes for a tile close enough for tiers, its spruce and its plain cones; one for a
    // tile that isn't, all its trees as cones: there are a couple of hundred tiles in view.)
    this.tiles = [];
    for (const { tiered, plain } of tiles.values()) {
      const all = instances(cone, [...tiered, ...plain]);
      const near = [instances(spruce, tiered), instances(cone, plain)].filter(Boolean);
      this.tiles.push({ near, all, centre: all.boundingSphere.center });
    }
  }

  // Which version of each tile's trees is drawn, for where the camera is.
  detail(camera) {
    if (!this.tiles || !this.group.visible) return;
    for (const tile of this.tiles) {
      const tiered = tile.centre.distanceToSquared(camera.position) < TIERS_TO ** 2;
      for (const mesh of tile.near) mesh.visible = tiered;
      tile.all.visible = !tiered;
    }
  }

}
