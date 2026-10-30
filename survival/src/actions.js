import { formatFuel } from './campfires.js';
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
export function createActions({ input, inventory, player, world, campfires, traps, pickups, survival, hud }) {
  let cooking = 0;

  // Adds items to the inventory. Anything that doesn't fit is dropped on the ground at
  // (dropX, dropZ), or at the player's feet.
  const give = (item, count, dropX = player.position.x, dropZ = player.position.z) => {
    const leftOver = inventory.add(item, count);
    if (count - leftOver > 0) hud.toast(`+${count - leftOver} ${ITEMS[item].name}`);
    if (leftOver > 0) {
      // If that spot is in the lake, drop it at the player's feet instead.
      if (!pickups.drop(item, leftOver, dropX, dropZ)) pickups.drop(item, leftOver, player.position.x, player.position.z);
      hud.toast(`Inventory full: ${leftOver} ${ITEMS[item].name.toLowerCase()} left on the ground`);
    }
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
    const pile = pickups.near(x, z, 1.3);
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
          give('cookedMeat', 1);
        }
      } else if (held === 'rawMeat') {
        prompt = `${status} · light it to cook`;
      }
    }

    if (!fire && pile) {
      // Something on the ground: E picks up as much as fits.
      const { name } = ITEMS[pile.item];
      const amount = pile.count > 1 ? ` ×${pile.count}` : '';
      prompt = `${name}${amount} on the ground · E to pick up`;
      if (pressedE && pile.item === 'backpack') {
        // The backpack isn't stored in a slot: finding it gives you its extra slots.
        pickups.remove(pile);
        inventory.hasBackpack = true;
        hud.toast('Found a backpack! Press Tab to open it');
      } else if (pressedE) {
        const taken = pickups.pickUp(pile, inventory);
        hud.toast(taken > 0 ? `+${taken} ${name}` : 'Inventory full');
      }
    } else if (!fire && trap) {
      // At a trap: E takes the catch out, or picks the empty trap back up.
      if (trap.caught) {
        prompt = `A ${trap.caught} is caught! · E to take it`;
        if (pressedE) {
          // Taking the catch out breaks the trap: you'll need to craft another.
          traps.collect(trap);
          traps.remove(trap);
          give('rawMeat', MEAT_PER_RABBIT, trap.x, trap.z);
          hud.toast('The trap broke');
        }
      } else {
        prompt = 'Trap is set · E to pick it up';
        if (pressedE) {
          traps.remove(trap);
          give('trap', 1);
        }
      }
    } else if (!fire && tree && held !== 'axe') {
      const axeSlot = inventory.slotOf('axe');
      if (axeSlot === -1) prompt = 'You need an axe to chop trees';
      else if (axeSlot >= HOTBAR_SIZE) prompt = 'Move the axe from your backpack to the hotbar to use it';
      else prompt = `Press ${axeSlot + 1} to take out your axe`;
    } else if (!fire && tree) {
      prompt = chopping ? 'Chopping…' : 'Hold Space or click to chop';
      progress = world.trees.progress(tree);
    } else if (!fire && held === 'campfire') {
      // A crafted campfire: place it on open ground in front of you.
      const spot = player.ahead(1.6);
      if (!campfires.canBuildAt(spot.x, spot.z)) {
        prompt = 'No room for a campfire here';
      } else if (input.startedUsingTool()) {
        inventory.remove('campfire', 1);
        campfires.build(spot.x, spot.z);
      } else {
        prompt = 'Space or click to place the campfire';
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
    if (chopping && world.trees.chop(tree, dt, x, z)) {
      // Wood that doesn't fit lands where the tree fell, a little beyond the stump.
      const away = Math.atan2(tree.spot.x - x, tree.spot.z - z);
      give('wood', tree.wood, tree.spot.x + Math.sin(away) * 1.6, tree.spot.z + Math.cos(away) * 1.6);
    }
    if (canDrink) prompt = drinking ? 'Drinking…' : 'Hold E to drink';

    player.setAction(held, chopping);
    return { drinking, working: chopping, prompt, progress };
  };
}
