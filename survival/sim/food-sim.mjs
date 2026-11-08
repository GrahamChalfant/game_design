// Node simulation of the food-ladder rules: berries (#74), stone knife (#75).
// Run: node sim/food-sim.mjs
import { RECIPES, isKnown, craft } from '../src/crafting.js';
import { Inventory } from '../src/inventory.js';
import { createRandom } from '../src/random.js';
import {
  ANIMAL_DROPS, KNIFE_DURABILITY, KNIFE_HITS_TO_KILL, KNIFE_RANGE, hitAnimal, knifeHitTest,
} from '../src/hunting.js';
import {
  BERRIES_PER_PICK, BERRY_HUNGER, BUSH_COUNT, BUSH_REGROW_MINUTES, BUSH_RING, bushSpots, hasBerries, pickBush,
} from '../src/foraging.js';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const knifeRecipe = RECIPES.find((r) => r.item === 'knife');

// 1) Berries (#74)
const spots = bushSpots(createRandom(1), () => true);
ok(spots.length === BUSH_COUNT && spots.every((s) => { const d = Math.hypot(s.x, s.z); return d >= BUSH_RING[0] && d <= BUSH_RING[1]; }), `1 ${BUSH_COUNT} bushes ${BUSH_RING[0]}–${BUSH_RING[1]} m from the wreck`);
ok(BERRY_HUNGER >= 10 && BERRY_HUNGER <= 15 && BERRY_HUNGER < 35, `1 berries +${BERRY_HUNGER} hunger (10–15, less than cooked meat's 35)`);
const bush = { x: 0, z: 0, pickedAt: null };
ok(pickBush(bush, 100) === BERRIES_PER_PICK && pickBush(bush, 101) === 0, `1 a bush gives ${BERRIES_PER_PICK} berries, then is bare`);
ok(!hasBerries(bush, 100 + BUSH_REGROW_MINUTES - 1) && hasBerries(bush, 100 + BUSH_REGROW_MINUTES), '1 bush regrows after exactly one game day (1440 min)');
// Day 1 on berries alone: hunger drains 2.8/h → ~67 per 24 h; all bushes once give this much.
ok(BUSH_COUNT * BERRIES_PER_PICK * BERRY_HUNGER >= 2.8 * 24, `1 one day of bushes (${BUSH_COUNT * BERRIES_PER_PICK * BERRY_HUNGER} hunger) covers a day's drain (${2.8 * 24})`);

// 2) Stone knife (#75)
const inv = new Inventory(); inv.hasBackpack = true;
ok(!isKnown(inv, knifeRecipe), '2 knife hidden before finding wood and stone');
inv.add('wood', 1); inv.add('stone', 1);
ok(isKnown(inv, knifeRecipe) && craft(inv, knifeRecipe) && inv.count('knife') === 1 && inv.count('wood') === 0 && inv.count('stone') === 0, '2 1 wood + 1 stone -> knife (no bow needed)');
ok(inv.slots[inv.slotOf('knife')].durability === KNIFE_DURABILITY && KNIFE_DURABILITY === 20, '2 knife has 20 durability');
const ahead = { kind: 'deer', position: { x: 0, z: 1.2 }, radius: 0.45, dead: false };
ok(knifeHitTest(0, 0, 0, [ahead]) === ahead, '2 stab reaches a deer 1.2 m ahead');
ok(knifeHitTest(0, 0, Math.PI, [ahead]) === null, '2 stab facing away misses');
ok(knifeHitTest(0, 0, 0, [{ ...ahead, position: { x: 0, z: KNIFE_RANGE + 1 } }]) === null, '2 stab is short-range');

// 3) Deer up close: two stabs; one arrow; six meat.
const deer = { kind: 'deer' };
ok([hitAnimal(deer, 'knife'), hitAnimal(deer, 'knife')].join() === 'false,true' && KNIFE_HITS_TO_KILL.deer === 2, '3 deer dies on the second stab');
ok(hitAnimal({ kind: 'deer' }, 'arrow'), '3 one arrow kills a deer');
ok(ANIMAL_DROPS.deer.rawMeat === 6, '3 deer yields 6 meat');

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
