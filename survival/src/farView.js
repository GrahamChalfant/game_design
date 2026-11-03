import * as THREE from 'three';

// A rough, see-a-long-way version of the whole map, for looking through the lookout's
// binoculars (#94): the ground in big 8 m squares and every tree as a simple shape. The game
// normally only draws the chunks near the player; this is only shown while the binoculars
// are up, and the close-by detail still draws on top of it.
const CELL = 8; // meters per square of the rough ground
const BUDGET_MS = 2; // the most time per frame spent building it
const SINK = 0.4; // sits this far below the real ground, so the detailed ground covers it nearby

export class FarView {
  constructor(scene, world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.building = this.build();
    this.treesBuilt = false;
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

  show(on) {
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
    const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  // Every standing tree as a simple shape: dark cones for spruce, round light-green crowns
  // on pale trunks for birch and the field trees.
  buildTrees() {
    this.treesBuilt = true;
    const trees = this.world.trees.all.filter((tree) => tree.state === 'standing');
    const spruce = trees.filter((tree) => tree.kind.startsWith('pine') || tree.kind === 'sapling-pine' || tree.kind === 'tree-dead');
    const leafy = trees.filter((tree) => !spruce.includes(tree));
    const cone = new THREE.ConeGeometry(1.6, 8, 6).translate(0, 4.6, 0);
    const crown = new THREE.IcosahedronGeometry(1.6, 0).scale(1, 1.4, 1).translate(0, 5.6, 0);
    const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });
    const matrix = new THREE.Matrix4();
    const place = (geometry, color, list) => {
      const mesh = new THREE.InstancedMesh(geometry, material(color), list.length);
      list.forEach((tree, i) => {
        const { x, y, z, scale } = tree.spot;
        matrix.makeScale(scale, scale, scale).setPosition(x, y, z);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.frustumCulled = false;
      this.group.add(mesh);
    };
    place(cone, 0x2e5e38, spruce);
    place(crown, 0x8ea84e, leafy);
  }
}
