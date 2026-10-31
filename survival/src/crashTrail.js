import * as THREE from 'three';

const { smoothstep, clamp } = THREE.MathUtils;

// Where the plane came to rest. heading: which way the nose points (radians).
export const CRASH = { x: 0.5, z: -6, heading: 0.6 };

const LENGTH = 48; // meters from the plane back to the first touchdown
const BEND = 7; // how far the far end of the trail curves away from a straight line
const BERM_WIDTH = 1.4; // the ridge of soil pushed up along each side
// The marks left behind the plane, measured back from it. `from` and `to` are meters
// behind the plane, `side` is meters off the trail's middle, `width` is half the width.
// Reading from the far end: wheels touch down, the plane bounces, digs in, then skids.
const MARKS = [
  { from: -3, to: 27, side: 0, width: 1.7, depth: 0.4 },
  { from: 30, to: 37, side: 0.2, width: 1, depth: 0.28 },
  { from: 39, to: LENGTH, side: 1.3, width: 0.35, depth: 0.12 },
  { from: 39, to: LENGTH, side: -1.3, width: 0.35, depth: 0.12 },
];

const sin = Math.sin(CRASH.heading);
const cos = Math.cos(CRASH.heading);

// The world position `back` meters behind the plane and `side` meters off the trail's middle.
export function trailPoint(back, side) {
  const across = side + curve(back);
  return { x: CRASH.x - sin * back + cos * across, z: CRASH.z - cos * back - sin * across };
}

function curve(back) {
  return (back / LENGTH) ** 2 * BEND;
}

// What the crash did to the ground, worked out from (x, z) like the rest of the terrain.
export function createCrashTrail(noise) {
  const none = { height: 0, dirt: 0, streak: 0 };

  // height: how far the ground is raised (or cut, if negative). dirt: 0 (untouched) to 1 (bare soil).
  const at = (x, z) => {
    const dx = x - CRASH.x;
    const dz = z - CRASH.z;
    const back = -(dx * sin + dz * cos);
    if (back < -5 || back > LENGTH + 2) return none;
    const wobble = noise(back * 0.1, 40) * 0.7;
    const across = dx * cos - dz * sin - curve(back) - wobble;
    if (Math.abs(across) > 6) return none;

    let height = 0;
    let dirt = 0;
    for (const mark of MARKS) {
      // The gouge narrows to nothing at each end and varies in width along the way.
      const ends = clamp(Math.min(back - mark.from, mark.to - back) / 2.5, 0, 1);
      if (ends === 0) continue;
      const width = mark.width * ends * (1 + noise(back * 0.2, 80 + mark.side) * 0.35);
      const off = Math.abs(across - mark.side) - width;
      const berm = (BERM_WIDTH * mark.depth) / 0.4;
      const cut = 1 - smoothstep(off, -width * 0.6, 0);
      const ridge = off > 0 && off < berm ? Math.sin((off / berm) * Math.PI) * 0.55 : 0;
      height += (ridge - cut) * mark.depth * ends;
      dirt = Math.max(dirt, 1 - smoothstep(off + noise(x * 0.9, z * 0.9) * 0.5, berm * 0.45, berm));
    }
    return { height, dirt, streak: noise(across * 2.6, back * 0.06) };
  };

  return {
    at,
    // True close to the marks, for keeping trees and rocks off them.
    near(x, z, margin) {
      const dx = x - CRASH.x;
      const dz = z - CRASH.z;
      const back = -(dx * sin + dz * cos);
      const across = dx * cos - dz * sin - curve(back);
      return back > -5 && back < LENGTH + margin && Math.abs(across) < 2.5 + margin;
    },
  };
}
