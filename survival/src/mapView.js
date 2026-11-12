import { CRASH } from './crashTrail.js';

// The map (#94): press M while you carry one. It's a printed map of the whole area: the
// lakes, the river, the woods and the mountains, with the lookout tower marked. On it you can
// see where you are, the crash, your campfires and shelters, and the ground you've already
// covered, shaded in like a pencilled trail. Where you've been is remembered from the start
// of the game, so a map found later already shows it.
const PIXEL = 4; // meters per pixel of the map picture
const CELL = 16; // meters per square of "explored" ground
const SEEN = 48; // meters around you that count as explored
const BUDGET_MS = 3; // the most time per frame spent drawing the map picture
const PAPER = '#d9cba6';
const TRAIL = 'rgba(255, 244, 214, 0.3)'; // a pale wash over the ground you've covered

export class MapView {
  constructor(world) {
    this.world = world;
    // (The map is a rectangle: `cols` × `rows` pixels, its top left at the map's north-west corner.)
    const { minX, maxX, minZ, maxZ } = world.bounds;
    Object.assign(this, { minX, minZ });
    this.cols = Math.round((maxX - minX) / PIXEL);
    this.rows = Math.round((maxZ - minZ) / PIXEL);
    this.cellsX = Math.ceil((maxX - minX) / CELL);
    this.cellsZ = Math.ceil((maxZ - minZ) / CELL);
    this.explored = new Uint8Array(this.cellsX * this.cellsZ);

    this.panel = document.getElementById('map');
    this.canvas = this.panel.querySelector('canvas');
    this.canvas.width = this.cols;
    this.canvas.height = this.rows;
    this.ctx = this.canvas.getContext('2d');

    // The land itself, drawn a few rows at a time once you have a map.
    this.land = document.createElement('canvas');
    this.land.width = this.cols;
    this.land.height = this.rows;
    this.landCtx = this.land.getContext('2d');
    this.image = this.landCtx.createImageData(this.cols, this.rows);
    this.rowsDrawn = 0;
    this.drawing = false;

    // The ground you've covered, shaded in.
    this.trail = document.createElement('canvas');
    this.trail.width = this.cols;
    this.trail.height = this.rows;
    this.trailCtx = this.trail.getContext('2d');
    this.trailCtx.fillStyle = TRAIL;
    this.reset();
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  toggle() {
    this.panel.hidden = !this.panel.hidden;
  }

  close() {
    this.panel.hidden = true;
  }

  // Marks the ground around (x, z) as explored. Cheap: call it every frame.
  explore(x, z) {
    const reach = Math.ceil(SEEN / CELL);
    const cx = Math.floor((x - this.minX) / CELL);
    const cz = Math.floor((z - this.minZ) / CELL);
    for (let i = cx - reach; i <= cx + reach; i++) {
      for (let j = cz - reach; j <= cz + reach; j++) {
        if (i < 0 || j < 0 || i >= this.cellsX || j >= this.cellsZ) continue;
        const k = j * this.cellsX + i;
        if (this.explored[k]) continue;
        const middleX = (i + 0.5) * CELL + this.minX;
        const middleZ = (j + 0.5) * CELL + this.minZ;
        if (Math.hypot(middleX - x, middleZ - z) > SEEN) continue;
        this.explored[k] = 1;
        const p = CELL / PIXEL;
        this.trailCtx.fillRect(i * p, j * p, p, p);
      }
    }
  }

  // Draws more of the map picture (once you have a map), a little each frame.
  update(hasMap) {
    if (hasMap) this.drawing = true;
    if (!this.drawing || this.rowsDrawn >= this.rows) return;
    const { terrain } = this.world;
    const data = this.image.data;
    const deadline = performance.now() + BUDGET_MS;
    const first = this.rowsDrawn;
    while (this.rowsDrawn < this.rows && performance.now() < deadline) {
      const j = this.rowsDrawn++;
      for (let i = 0; i < this.cols; i++) {
        const x = (i + 0.5) * PIXEL + this.minX;
        const z = (j + 0.5) * PIXEL + this.minZ;
        let { r, g, b } = terrain.groundAt(x, z).color;
        if (terrain.waterDepth(x, z) > 0) [r, g, b] = [0.29, 0.49, 0.61];
        // Shade slopes facing away from the light (from the top left), so hills and
        // mountains stand out.
        const shade = (terrain.heightAt(x - 2, z - 2) - terrain.heightAt(x + 2, z + 2)) * 0.05;
        const k = (j * this.cols + i) * 4;
        data[k] = (r + shade) * 255;
        data[k + 1] = (g + shade) * 255;
        data[k + 2] = (b + shade) * 255;
        data[k + 3] = 255;
      }
    }
    this.landCtx.putImageData(this.image, 0, 0, 0, first, this.cols, this.rowsDrawn - first);
  }

  // Draws the open map: the land, the ground you've covered, and markers.
  draw({ player, lookout, pois = [], roads = [], creeks = [], campfires, shelters }) {
    if (!this.isOpen) return;
    const ctx = this.ctx;
    const at = (x) => (x - this.minX) / PIXEL;
    const atZ = (z) => (z - this.minZ) / PIXEL;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.cols, this.rows);
    ctx.drawImage(this.land, 0, 0);
    ctx.drawImage(this.trail, 0, 0);
    if (this.rowsDrawn < this.rows) {
      ctx.fillStyle = '#5a4a32';
      ctx.font = '10px sans-serif';
      ctx.fillText(`Drawing the map… ${Math.round((this.rowsDrawn / this.rows) * 100)}%`, 8, this.rows - 8);
    }

    const label = (text, x, y) => {
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(240, 230, 205, 0.85)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#3a2a1a';
      ctx.fillText(text, x, y);
    };
    // The lookout towers: a little tower shape each.
    for (const tower of lookout.all ?? [lookout]) {
      const x = at(tower.x);
      const y = atZ(tower.z);
      ctx.fillStyle = '#3a2a1a';
      ctx.beginPath();
      ctx.moveTo(x - 3, y + 4);
      ctx.lineTo(x - 1.5, y - 3);
      ctx.lineTo(x + 1.5, y - 3);
      ctx.lineTo(x + 3, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - 3, y - 6, 6, 3);
      label('Lookout', x, y + 12);
    }
    // Creeks: thin blue lines (too narrow to show up in the land picture), widening downstream.
    ctx.save();
    ctx.strokeStyle = 'rgb(74, 125, 156)';
    ctx.lineCap = 'round';
    for (const { points } of creeks) {
      for (let i = 1; i < points.length; i++) {
        ctx.lineWidth = 0.6 + (i / points.length) * 0.8;
        ctx.beginPath();
        ctx.moveTo(at(points[i - 1].x), atZ(points[i - 1].z));
        ctx.lineTo(at(points[i].x), atZ(points[i].z));
        ctx.stroke();
      }
    }
    ctx.restore();
    // The old fire road: a dashed brown track.
    ctx.save();
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 2]);
    for (const path of roads) {
      ctx.beginPath();
      path.forEach(({ x, z }, i) => (i ? ctx.lineTo(at(x), atZ(z)) : ctx.moveTo(at(x), atZ(z))));
      ctx.stroke();
    }
    ctx.restore();
    // Cabins (little houses) and caves (dark arches). Hunting stands are too small to be marked.
    for (const poi of pois) {
      const x = at(poi.x);
      const y = atZ(poi.z);
      ctx.fillStyle = '#3a2a1a';
      ctx.beginPath();
      if (poi.kind === 'cabin') {
        ctx.rect(x - 3, y - 1, 6, 4);
        ctx.moveTo(x - 4, y - 1);
        ctx.lineTo(x, y - 4.5);
        ctx.lineTo(x + 4, y - 1);
      } else if (poi.kind === 'cave') {
        ctx.arc(x, y + 2, 4, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d9cba6';
        ctx.beginPath();
        ctx.arc(x, y + 2, 1.8, Math.PI, 0);
      } else continue;
      ctx.closePath();
      ctx.fill();
    }
    // The crash: a red cross.
    {
      const x = at(CRASH.x);
      const y = atZ(CRASH.z);
      ctx.strokeStyle = '#a83a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4);
      ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
      label('Crash', x, y + 13);
    }
    // Your campfires (orange dots) and shelters (little roofs).
    ctx.fillStyle = '#e8762a';
    for (const fire of campfires.fires) {
      ctx.beginPath();
      ctx.arc(at(fire.x), atZ(fire.z), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6b4a32';
    for (const shelter of shelters.all) {
      const x = at(shelter.x);
      const y = atZ(shelter.z);
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y + 2.5);
      ctx.lineTo(x, y - 3);
      ctx.lineTo(x + 3.5, y + 2.5);
      ctx.closePath();
      ctx.fill();
    }
    // You: an arrow pointing the way you're facing.
    {
      const x = at(player.position.x);
      const y = atZ(player.position.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI - player.facing);
      ctx.fillStyle = '#a83a2a';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 4);
      ctx.lineTo(0, 2);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Forgets where you've been, for a new game. (The map picture itself stays: it's the same map.)
  reset() {
    this.explored.fill(0);
    this.trailCtx.clearRect(0, 0, this.cols, this.rows);
    this.close();
  }
}
