import { formatFuel } from './campfires.js';
import { isNight } from './daylight.js';
import { HOTBAR_SIZE, ITEMS } from './inventory.js';
import { ANIMAL_DROPS, BOW_COOLDOWN, BUTCHER_TIME, KNIFE_COOLDOWN, hitAnimal, knifeHitTest } from './hunting.js';
import { BERRY_HUNGER, hasBerries, regrowLeft } from './foraging.js';

const COOK_TIME = 3; // seconds of holding the mouse button at a fire to cook one piece of meat
const SEARCH_TIME = 1.5; // seconds of holding E to search a suitcase
const WARMTH_REACH = 3; // how close to a burning fire warms you up, in meters
const WET_DEPTH = 0.3; // water this deep (in meters) chills you
const BANDAGE_HEALING = 30;
const FLASK_DRINK = 35; // thirst one drink from the flask restores
// What eating each food does to hunger and health.
const FOOD = {
  cookedMeat: { hunger: 35, health: 0, message: 'Delicious' },
  rawMeat: { hunger: 12, health: -15, message: 'You feel sick' },
  berries: { hunger: BERRY_HUNGER, health: 0, message: 'Tart, but it helps' }, // no spoiling in v1 (#74)
};

// Works out what the player is doing each frame (drinking, chopping, building,
// trapping, cooking, eating) and what to tell them.
export function createActions({ input, inventory, player, world, wreck, lookout, campfires, shelters, traps, pickups, bushes, animals, arrows, survival, hud, onSleep, onBinoculars, aimPoint }) {
  let cooking = 0;
  let searching = 0;
  let butchering = 0;
  let bowReady = 0; // seconds until the bow can shoot again
  let knifeReady = 0; // seconds until the knife can stab again

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
    // Somewhere to search: a suitcase at the wreck, or the lookout tower's supply crate.
    const crate = lookout.near(x, z, 1.8, player.feet);
    const container = crate ?? wreck.near(x, z, 1.8);
    const carcass = animals.carcassNear(x, z, 1.8);
    let searchingNow = false;
    let butcheringNow = false;
    bowReady = Math.max(0, bowReady - dt);
    knifeReady = Math.max(0, knifeReady - dt);
    const bush = bushes.near(x, z, 1.4);
    const now = survival.minutesSurvived;
    const tree = player.treeInReach(world);
    const chopping = Boolean(tree && held === 'axe' && input.usingTool() && !player.airborne);
    let prompt = null;
    let progress = null;
    let cookingNow = false;

    if (fire) {
      // Tending a fire: E lights it (with a lighter) or adds a log.
      // Raw meat in hand: hold the mouse button to cook it.
      const wood = inventory.count('wood');
      const hasLighter = inventory.count('lighter') > 0;
      const needsLighting = !campfires.isBurning(fire) && fire.fuel > 0;
      if (pressedE && needsLighting && hasLighter) {
        campfires.light(fire);
        hud.toast('The fire catches');
      } else if (pressedE && !needsLighting && wood > 0 && campfires.addWood(fire)) {
        inventory.remove('wood', 1);
        hud.toast('-1 Wood');
      }
      const burning = campfires.isBurning(fire);
      let status;
      let tend;
      if (burning) {
        status = `Campfire: ${formatFuel(fire.fuel)} left`;
        tend = wood > 0 ? 'E to add wood' : 'no wood to add';
      } else if (fire.fuel > 0) {
        status = 'Campfire: not lit';
        tend = hasLighter ? 'E to light it' : 'you need a lighter to light it';
      } else {
        status = 'The fire is out';
        tend = wood > 0 ? 'E to add wood' : 'it needs wood';
      }
      prompt = `${status} · ${tend}`;

      if (held === 'rawMeat' && burning) {
        cookingNow = input.usingTool();
        cooking = cookingNow ? cooking + dt : 0;
        progress = cooking / COOK_TIME;
        prompt = `${cookingNow ? 'Cooking…' : 'Click and hold to cook'} · ${tend}`;
        if (cooking >= COOK_TIME) {
          cooking = 0;
          inventory.remove('rawMeat', 1);
          give('cookedMeat', 1);
        }
      } else if (held === 'rawMeat') {
        prompt = `${status} · light it to cook`;
      } else if (held === 'torch' && burning) {
        prompt = `Click to light the torch · ${tend}`;
        if (input.startedUsingTool()) {
          inventory.remove('torch', 1);
          give('litTorch', 1);
        }
      } else if (held === 'torch') {
        prompt = `${status} · light it to light your torch`;
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
    } else if (!fire && bush && hasBerries(bush, now)) {
      // A berry bush in fruit: E picks a handful.
      prompt = 'Berry bush · E to pick berries';
      if (pressedE) give('berries', bushes.pick(bush, now), bush.x, bush.z);
    } else if (!fire && carcass) {
      // A shot animal: hold E to butcher it for meat, hide and intestines.
      const time = BUTCHER_TIME[carcass.kind];
      butcheringNow = input.isDown('KeyE');
      butchering = butcheringNow ? butchering + dt : 0;
      progress = butchering / time;
      prompt = butcheringNow ? 'Butchering…' : `A dead ${carcass.kind} · hold E to butcher it`;
      if (butchering >= time) {
        butchering = 0;
        const { x: cx, z: cz } = carcass.position;
        animals.remove(carcass);
        for (const [item, count] of Object.entries(ANIMAL_DROPS[carcass.kind])) give(item, count, cx, cz);
      }
    } else if (!fire && lookout.binocularsNear(x, z, player.feet)) {
      // The lookout's binoculars: E to look through them and see far across the land.
      prompt = 'Binoculars · E to look through them';
      if (pressedE) onBinoculars();
    } else if (!fire && container && !container.searched) {
      // Hold E to search a suitcase; everything inside is yours.
      searchingNow = input.isDown('KeyE');
      searching = searchingNow ? searching + dt : 0;
      progress = searching / SEARCH_TIME;
      prompt = searchingNow ? 'Searching…' : `Hold E to search ${container.label}`;
      if (searching >= SEARCH_TIME) {
        searching = 0;
        if (container.note) hud.toast(`You found ${container.note}`);
        for (const [item, count] of (crate ? lookout : wreck).search(container)) give(item, count, container.x, container.z);
      }
    } else if (!fire && trap) {
      // At a trap: E takes the catch out, or picks the empty trap back up.
      if (trap.caught) {
        prompt = `A ${trap.caught} is caught! · E to take it`;
        if (pressedE) {
          // Taking the catch out breaks the trap: you'll need to craft another.
          const caught = traps.collect(trap);
          traps.remove(trap);
          for (const [item, count] of Object.entries(ANIMAL_DROPS[caught])) give(item, count, trap.x, trap.z);
          hud.toast('The trap broke');
        }
      } else {
        prompt = 'Trap is set · E to pick it up';
        if (pressedE) {
          traps.remove(trap);
          give('trap', 1);
        }
      }
    } else if (!fire && tree && !held) {
      // Empty-handed at a tree: say how to chop it. (Holding something else, that item wins,
      // so you can still shoot, eat or bandage up next to a tree.)
      const axeSlot = inventory.slotOf('axe');
      if (axeSlot === -1) prompt = 'You need an axe to chop trees';
      else if (axeSlot >= HOTBAR_SIZE) prompt = 'Move the axe from your backpack to the hotbar to use it';
      else prompt = `Press ${axeSlot + 1} to take out your axe`;
    } else if (!fire && tree && held === 'axe') {
      prompt = chopping ? 'Chopping…' : 'Click and hold to chop';
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
        prompt = 'Click to place the campfire';
      }
    } else if (!fire && held === 'shelter') {
      // A crafted shelter: place it a few steps ahead (its open front always faces the camera).
      const spot = player.ahead(2.8);
      if (!shelters.canBuildAt(spot.x, spot.z)) {
        prompt = 'Not enough open ground for a shelter here';
      } else if (input.startedUsingTool()) {
        inventory.remove('shelter', 1);
        shelters.build(spot.x, spot.z);
      } else {
        prompt = 'Click to build the shelter';
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
        prompt = 'Click to set the trap';
      }
    } else if (!fire && held === 'bandage') {
      if (survival.health >= 100) {
        prompt = "You're not hurt";
      } else {
        prompt = `Click to use a bandage (+${BANDAGE_HEALING} health)`;
        if (input.startedUsingTool()) {
          inventory.remove('bandage', 1);
          survival.eat(0, BANDAGE_HEALING);
          hud.toast('You patch yourself up');
        }
      }
    } else if (!fire && held === 'map') {
      prompt = 'Press M to look at the map';
    } else if (!fire && held === 'torch') {
      prompt = 'Hold it at a burning campfire and click to light it';
    } else if (!fire && held === 'litTorch') {
      const { burn } = inventory.slots[inventory.selected];
      prompt = `Lit torch · burns for ${formatFuel(burn)} more`;
    } else if (!fire && held === 'parka') {
      prompt = 'Click to put on the hide parka';
      if (input.startedUsingTool()) {
        inventory.remove('parka', 1);
        inventory.outfit = 'parka';
        hud.toast('You pull on the hide parka. Much warmer.');
      }
    } else if (!fire && held === 'lighter') {
      prompt = 'Keep it on you to light campfires (E next to one)';
    } else if (!fire && held === 'flask') {
      // Click at the water's edge (or in it) to fill up; anywhere else to take a drink.
      const flask = inventory.slots[inventory.selected];
      const { holds } = ITEMS.flask;
      if (canDrink && flask.water < holds) {
        prompt = `Water flask ${flask.water}/${holds} · click to fill it · hold E to drink`;
        if (input.startedUsingTool()) {
          flask.water = holds;
          hud.toast('Flask filled');
        }
      } else if (flask.water === 0) {
        prompt = 'The flask is empty · fill it at the lake or river';
      } else {
        prompt = `Water flask ${flask.water}/${holds} · click to drink`;
        if (input.startedUsingTool()) {
          flask.water -= 1;
          survival.drink(FLASK_DRINK);
          hud.toast('Refreshing');
        }
      }
    } else if (!fire && held === 'bow') {
      // Click to shoot an arrow the way you're facing. Each shot wears the bow down.
      const bow = inventory.slots[inventory.selected];
      const arrowsLeft = inventory.count('arrow');
      if (arrowsLeft === 0) {
        prompt = 'No arrows · craft them from wood and stone (Tab)';
      } else {
        prompt = `Bow ${bow.durability}/${ITEMS.bow.durability} · ${arrowsLeft} arrows · click where to shoot`;
        if (input.startedUsingTool() && bowReady === 0 && !player.swimming) {
          bowReady = BOW_COOLDOWN;
          inventory.remove('arrow', 1);
          // Shoot toward the spot on the ground under the mouse, turning to face it.
          const target = aimPoint();
          if (target) player.facing = Math.atan2(target.x - x, target.z - z);
          const from = player.ahead(0.5);
          arrows.fire(from.x, from.z, player.facing);
          bow.durability -= 1;
          if (bow.durability <= 0) {
            inventory.slots[inventory.selected] = null;
            hud.toast('Your bow snapped');
          }
        }
      }
    } else if (!fire && held === 'knife') {
      const knife = inventory.slots[inventory.selected];
      prompt = `Stone knife ${knife.durability}/${ITEMS.knife.durability} · click to stab`;
    } else if (!fire && bush) {
      const hours = Math.ceil(regrowLeft(bush, now) / 60);
      prompt = `This bush has been picked · berries again in about ${hours} h`;
    } else if (!fire && held === 'arrow') {
      prompt = 'Equip a bow to shoot arrows';
    } else if (!fire && held === 'stone') {
      prompt = 'Stones are used to craft knives and arrows (Tab)';
    } else if (!fire && held === 'bowstring') {
      prompt = 'Bowstrings are used to craft a bow (Tab)';
    } else if (!fire && held === 'flare') {
      prompt = 'Save the flare to signal a rescue plane';
    } else if (!fire && held === 'rope') {
      prompt = 'Rope is used to craft traps (Tab)';
    } else if (!fire && held === 'cookedMeat') {
      prompt = 'Click to eat';
      if (input.startedUsingTool()) eat('cookedMeat');
    } else if (!fire && held === 'rawMeat') {
      prompt = 'Cook it at a campfire · click to eat it raw (risky)';
      if (input.startedUsingTool()) eat('rawMeat');
    } else if (!fire && held === 'berries') {
      prompt = `Click to eat (+${BERRY_HUNGER} hunger)`;
      if (input.startedUsingTool()) eat('berries');
    }

    // Stone knife (#75): click or hold to stab whatever's right in front of you. Only stabs
    // that land wear it down. Works next to a carcass or bush too, so you can fight a boar there.
    if (held === 'knife' && input.usingTool() && knifeReady === 0 && !player.swimming && !player.airborne) {
      knifeReady = KNIFE_COOLDOWN;
      player.stab();
      const target = knifeHitTest(x, z, player.facing, animals.all);
      if (target) {
        const knife = inventory.slots[inventory.selected];
        if (hitAnimal(target, 'knife')) {
          animals.kill(target);
          hud.toast(`You killed a ${target.kind}! Hold E next to it to butcher it`);
        } else hud.toast(`You stab the ${target.kind}`);
        knife.durability -= 1;
        if (knife.durability <= 0) {
          inventory.slots[inventory.selected] = null;
          hud.toast('Your knife broke');
        }
      }
    }

    if (!cookingNow) cooking = 0;
    if (!searchingNow) searching = 0;
    if (!butcheringNow) butchering = 0;
    if (chopping && world.trees.chop(tree, dt, x, z)) {
      // Wood that doesn't fit lands where the tree fell, a little beyond the stump.
      const away = Math.atan2(tree.spot.x - x, tree.spot.z - z);
      give('wood', tree.wood, tree.spot.x + Math.sin(away) * 1.6, tree.spot.z + Math.cos(away) * 1.6);
    }
    // (With a flask in hand, the flask's prompt already says how to drink here.)
    if (canDrink && !(held === 'flask' && !drinking)) prompt = drinking ? 'Drinking…' : 'Hold E to drink';

    // Under a shelter you're warm, and at night E sleeps until morning.
    const shelter = shelters.around(x, z);
    if (shelter && !prompt) {
      const night = isNight(survival.hourOfDay);
      prompt = night ? "Shelter · warmer here · E to sleep until morning" : "Shelter · warmer here";
      if (night && pressedE) onSleep();
    }

    player.setAction(inventory.selectedItem, chopping, drinking, inventory.hasBackpack);
    const warmFire = campfires.near(x, z, WARMTH_REACH);
    const nearFire = Boolean(warmFire && campfires.isBurning(warmFire));
    const wet = world.terrain.waterDepth(x, z) > WET_DEPTH;
    const cold = world.terrain.coldAt(x, z); // up the mountains
    return { drinking, working: chopping, fire: nearFire, shelter: Boolean(shelter), wet, cold, outfit: inventory.outfit, prompt, progress };
  };
}
