// Finds things near a spot quickly, by sorting them into square cells on the ground, so a
// big map with tens of thousands of trees and rocks doesn't need checking one by one.
// Each thing is a circle: { x, z, radius }. Its radius may shrink later (a tree becoming a
// stump), but it mustn't move or grow; remove it and add it again instead.
export class SpatialGrid {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.maxRadius = 0; // the biggest circle added, so a search can reach into nearby cells
    this.count = 0;
  }

  key(x, z) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  add(item) {
    const key = this.key(item.x, item.z);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(item);
    this.maxRadius = Math.max(this.maxRadius, item.radius);
    this.count++;
    return item;
  }

  remove(item) {
    const cell = this.cells.get(this.key(item.x, item.z));
    const i = cell ? cell.indexOf(item) : -1;
    if (i < 0) return;
    cell.splice(i, 1);
    this.count--;
  }

  // Everything that might reach within `reach` of (x, z). Check the exact distance yourself.
  *near(x, z, reach) {
    const r = reach + this.maxRadius;
    const minX = Math.floor((x - r) / this.cellSize);
    const maxX = Math.floor((x + r) / this.cellSize);
    const minZ = Math.floor((z - r) / this.cellSize);
    const maxZ = Math.floor((z + r) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const cell = this.cells.get((cx + 32768) * 65536 + (cz + 32768));
        if (cell) yield* cell;
      }
    }
  }

  // True if nothing comes within `gap` meters of (x, z). (The same cells as near(), walked with
  // plain loops: it's called millions of times while the map's laid out, and a generator is slow.)
  isClear(x, z, gap) {
    const r = gap + this.maxRadius;
    const size = this.cellSize;
    const minX = Math.floor((x - r) / size);
    const maxX = Math.floor((x + r) / size);
    const minZ = Math.floor((z - r) / size);
    const maxZ = Math.floor((z + r) / size);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const cell = this.cells.get((cx + 32768) * 65536 + (cz + 32768));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const o = cell[i];
          if (Math.hypot(o.x - x, o.z - z) <= o.radius + gap) return false;
        }
      }
    }
    return true;
  }

  // Takes everything out.
  clear() {
    this.cells.clear();
    this.maxRadius = 0;
    this.count = 0;
  }

  // Every thing in the grid.
  *[Symbol.iterator]() {
    for (const cell of this.cells.values()) yield* cell;
  }
}
