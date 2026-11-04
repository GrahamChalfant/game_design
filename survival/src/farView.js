import * as THREE from 'three';

// A rough, see-a-long-way version of the whole map: the ground in big 8 m squares and every
// tree as a simple shape. The game only draws the chunks near the player in full detail; this
// fills in the land beyond them when you can see that far: through the lookout's binoculars
// (#94), and in the third- and first-person views (see views.js). Inside the detailed chunks it
// isn't drawn at all (see `near`), so the two never overlap.
const CELL = 8; // meters per square of the rough ground
const BUDGET_MS = 2; // the most time per frame spent building it
const TREE_TILE = 96; // meters along each side of a tile of far trees
const SINK = 0.4; // sits this far below the real ground, so the seam with the detailed ground hides

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

  // Builds a little more of the rough ground. Call every frame; it stops once it's done.
  update() {
    if (!this.building) return;
    const deadline = performance.now() + BUDGET_MS;
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
    const size = this.world.size + 80;
    const cells = Math.round(size / CELL);
    const geometry = new THREE.PlaneGeometry(size, size, cells, cells).rotateX(-Math.PI / 2);
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

  // Every standing tree as a simple shape: dark blue-green cones for spruce, round olive crowns
  // for birch and the field trees (the colours of the trees up close, seen through the haze).
  buildTrees() {
    this.treesBuilt = true;
    const trees = this.world.trees.all.filter((tree) => tree.state === 'standing');
    const spruce = trees.filter((tree) => tree.kind.startsWith('pine') || tree.kind === 'sapling-pine' || tree.kind === 'tree-dead');
    const leafy = trees.filter((tree) => !spruce.includes(tree));
    const cone = new THREE.ConeGeometry(1.6, 8, 6, 1, true).translate(0, 4.6, 0);
    const crown = new THREE.IcosahedronGeometry(1.6, 0).scale(1, 1.4, 1).translate(0, 5.6, 0);
    const trunk = new THREE.CylinderGeometry(0.12, 0.18, 5, 4, 1, true).translate(0, 2.5, 0);
    const material = (color) => skipNearTrees(new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));
    const matrix = new THREE.Matrix4();
    // The trees go in square tiles, each its own mesh, so the camera skips the tiles behind
    // it and beyond its far edge (there are tens of thousands of trees).
    const place = (geometry, color, list) => {
      const shared = material(color);
      const tiles = new Map();
      for (const tree of list) {
        const key = `${Math.floor(tree.spot.x / TREE_TILE)},${Math.floor(tree.spot.z / TREE_TILE)}`;
        if (!tiles.has(key)) tiles.set(key, []);
        tiles.get(key).push(tree);
      }
      for (const tile of tiles.values()) {
        const mesh = new THREE.InstancedMesh(geometry, shared, tile.length);
        tile.forEach((tree, i) => {
          const { x, y, z, scale } = tree.spot;
          matrix.makeScale(scale, scale, scale).setPosition(x, y, z);
          mesh.setMatrixAt(i, matrix);
        });
        mesh.computeBoundingSphere();
        this.group.add(mesh);
      }
    };
    place(trunk, 0xc8c4b6, leafy.filter((tree) => tree.kind === 'birch'));
    place(trunk, 0x4a3a2e, leafy.filter((tree) => tree.kind !== 'birch'));
    place(cone, 0x34493f, spruce);
    place(crown, 0x8f8c58, leafy);
  }

}
