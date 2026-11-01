// Node simulation of the bow-hunting rules (issue #23). Run: node sim/hunting-sim.mjs
import { RECIPES, isKnown, canCraft, craft } from '../src/crafting.js';
import { Inventory } from '../src/inventory.js';
import { createRandom } from '../src/random.js';
import {
  ANIMAL_DROPS, BOW_DURABILITY, BUTCHER_TIME, STONE_AREA_PER_STONE, STONE_STACK,
  arrowHitTest, fleeDistance, hitAnimal, stoneSpots,
} from '../src/hunting.js';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const recipe = (item) => RECIPES.find((r) => r.item === item);
const known = (inv, item) => isKnown(inv, recipe(item));

// 1) Recipes and unlocks
const inv = new Inventory(); inv.hasBackpack = true;
ok(!known(inv, 'bowstring'), '1 bowstring hidden before finding gut');
inv.add('gut', 2); inv.add('wood', 10); inv.add('stone', 2);
ok(known(inv, 'bowstring') && !known(inv, 'bow') && !known(inv, 'arrow'), '1 gut unlocks bowstring only');
ok(craft(inv, recipe('bowstring')) && craft(inv, recipe('bowstring')) && inv.count('bowstring') === 2 && inv.count('gut') === 0, '1 1 gut -> 1 bowstring (x2)');
ok(known(inv, 'bow') && !known(inv, 'arrow'), '1 holding a bowstring unlocks the bow');
ok(craft(inv, recipe('bow')) && inv.count('bow') === 1 && inv.count('wood') === 7 && inv.count('bowstring') === 0, '1 3 wood + 2 bowstring -> bow');
ok(inv.slots[inv.slotOf('bow')].durability === BOW_DURABILITY && BOW_DURABILITY === 30, `1 bow has ${BOW_DURABILITY} shots`);
ok(known(inv, 'arrow'), '1 holding a bow unlocks arrows');
ok(craft(inv, recipe('arrow')) && inv.count('arrow') === 3 && inv.count('stone') === 1 && inv.count('wood') === 6, '1 1 wood + 1 stone -> 3 arrows');
inv.remove('bow', 1);
ok(!known(inv, 'arrow'), '1 arrows recipe needs the bow in hand');
const stones = new Inventory(); ok(stones.add('stone', 25) === 0 && stones.slots[0].count === STONE_STACK && STONE_STACK === 20, '1 stones stack to 20');

// 2) One-shot kills
for (const kind of ['deer', 'rabbit']) ok(hitAnimal({ kind }), `2 one arrow kills a ${kind}`);
const deer = { kind: 'deer', position: { x: 0, z: 10 }, radius: 0.6, dead: false };
ok(arrowHitTest(0, 0, 0, 12, [deer]) === deer, '2 arrow flying through a deer hits it');
ok(arrowHitTest(2, 0, 2, 12, [deer]) === null, '2 arrow 2 m to the side misses');
ok(arrowHitTest(0, 0, 0, 12, [{ ...deer, dead: true }]) === null, '2 dead animals are not hit again');

// 3) Flee distances
ok(fleeDistance('deer', false) === 12 && fleeDistance('deer', true) === 5, '3 deer flee at 12 m standing, 5 m crouching');

// 4) Yield
const d = ANIMAL_DROPS.deer;
ok(d.rawMeat === 6 && d.hide === 2 && d.gut === 2 && BUTCHER_TIME.deer === 4, '4 deer: 6 meat, 2 hides, 2 guts, 4 s to butcher');

// 5) Stone spawning density/clusters (on an open 140 m map where everywhere is valid)
const spots = stoneSpots(createRandom(1), 140, () => true);
ok(spots.length === Math.round(140 * 140 / STONE_AREA_PER_STONE), `5 ${spots.length} stones on a 140 m map (~1 per ${STONE_AREA_PER_STONE} m²)`);
const none = stoneSpots(createRandom(1), 140, (x) => x > 0);
ok(none.every((s) => s.x > -3), '5 stones only near allowed group centres');

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
