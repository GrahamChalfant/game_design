import { WOOD_TO_BUILD, formatFuel } from './campfires.js';
import { HOTBAR_SIZE, ITEMS } from './inventory.js';

const COOK_TIME = 3; // seconds of holding Space at a fire to cook one piece of meat
const MEAT_PER_RABBIT = 2;
// What eating each food does to hunger and health.
const FOOD = {
  cookedMeat: { hunger: 35, health: 0, message: 'Delicious' },
  rawMeat: { hunger: 12, health: -15, message: 'You feel sick' },
};

// Works out what the player is doing each frame (drinking, chopping, building,
// trapping, cooking, eating) and what to tell them.
export function createActions({ input, inventory, player, world, campfires, traps, survival, hud }) {
  let cooking = 0;

  // Tries to add items; says so if they don't all fit. Returns true if everything fit.
  const give = (item, count) => {
    const leftOver = inventory.add(item, count);
    if (count - leftOver > 0) hud.toast(`+${count - leftOver} ${ITEMS[item].name}`);
    if (leftOver > 0) hud.toast('Inventory full');
    return leftOver === 0;
  };

  const eat = (food) => {
    inventory.remove(food, 1);
    survival.eat(FOOD[food].hunger, FOOD[food].health);
    hud.toast(FOOD[food].message);
  };

  return function update(dt) {
    if (!survival.alive) return { prompt: null };
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) inventory.select(i);
    }

    const held = inventory.selectedItem;
    const { x, z } = player.position;
    const pressedE = input.wasPressed('KeyE');
    const canDrink = player.canDrink(world);
    const drinking = canDrink && input.isDown('KeyE');
    const fire = campfires.near(x, z, 1.2);
    const trap = traps.near(x, z, 1.3);
    const tree = player.treeInReach(world);
    const chopping = Boolean(tree && held === 'axe' && input.usingTool());
    let prompt = null;
    let progress = null;
    let cookingNow = false;

    if (fire) {
      // Tending a fire: E adds a log. Raw meat in hand: hold Space to cook it.
      const wood = inventory.count('wood');
      if (pressedE && wood > 0 && campfires.addWood(fire)) {
        inventory.remove('wood', 1);
        hud.toast('-1 Wood');
      }
      const burning = fire.fuel > 0;
      const status = burning ? `Campfire: ${formatFuel(fire.fuel)} left` : 'The fire is out';
      const tend = wood > 0 ? (burning ? 'E to add wood' : 'E to relight (1 wood)') : 'no wood to add';
      prompt = `${status} · ${tend}`;

      if (held === 'rawMeat' && burning) {
        cookingNow = input.usingTool();
        cooking = cookingNow ? cooking + dt : 0;
        progress = cooking / COOK_TIME;
        prompt = `${cookingNow ? 'Cooking…' : 'Hold Space to cook'} · ${tend}`;
        if (cooking >= COOK_TIME) {
          cooking = 0;
          inventory.remove('rawMeat', 1);
          if (!give('cookedMeat', 1)) inventory.add('rawMeat', 1);
        }
      } else if (held === 'rawMeat') {
        prompt = `${status} · light it to cook`;
      }
    }

    if (!fire && trap) {
      // At a trap: E takes the catch out, or picks the empty trap back up.
      if (trap.caught) {
        prompt = `A ${trap.caught} is caught! · E to take it`;
        if (pressedE && inventory.spaceFor('rawMeat') < MEAT_PER_RABBIT) hud.toast('Inventory full');
        else if (pressedE) {
          give('rawMeat', MEAT_PER_RABBIT);
          traps.collect(trap);
        }
      } else {
        prompt = 'Trap is set · E to pick it up';
        if (pressedE && give('trap', 1)) traps.pickUp(trap);
      }
    } else if (!fire && tree && held !== 'axe') {
      prompt = `Press ${inventory.slotOf('axe') + 1} to take out your axe`;
    } else if (!fire && tree) {
      prompt = chopping ? 'Chopping…' : 'Hold Space or click to chop';
      progress = world.trees.progress(tree);
    } else if (!fire && held === 'wood') {
      // Building: use wood on open ground to make a campfire.
      const spot = player.ahead(1.6);
      if (inventory.count('wood') < WOOD_TO_BUILD) {
        prompt = `You need ${WOOD_TO_BUILD} wood to build a campfire`;
      } else if (!campfires.canBuildAt(spot.x, spot.z)) {
        prompt = 'No room for a campfire here';
      } else if (input.startedUsingTool()) {
        inventory.remove('wood', WOOD_TO_BUILD);
        campfires.build(spot.x, spot.z);
        hud.toast(`-${WOOD_TO_BUILD} Wood`);
      } else {
        prompt = `Space or click to build a campfire (${WOOD_TO_BUILD} wood)`;
      }
    } else if (!fire && held === 'trap') {
      const spot = player.ahead(1.2);
      if (!traps.canPlaceAt(spot.x, spot.z)) {
        prompt = 'No room for a trap here';
      } else if (input.startedUsingTool()) {
        inventory.remove('trap', 1);
        traps.place(spot.x, spot.z, player.facing);
        hud.toast('Trap set. Rabbits nearby will be drawn to it.');
      } else {
        prompt = 'Space or click to set the trap';
      }
    } else if (!fire && held === 'cookedMeat') {
      prompt = 'Space or click to eat';
      if (input.startedUsingTool()) eat('cookedMeat');
    } else if (!fire && held === 'rawMeat') {
      prompt = 'Cook it at a campfire · Space to eat it raw (risky)';
      if (input.startedUsingTool()) eat('rawMeat');
    }

    if (!cookingNow) cooking = 0;
    if (chopping && world.trees.chop(tree, dt, x, z)) give('wood', tree.wood);
    if (canDrink) prompt = drinking ? 'Drinking…' : 'Hold E to drink';

    player.setAction(held, chopping);
    return { drinking, working: chopping, prompt, progress };
  };
}
