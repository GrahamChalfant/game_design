import { formatFuel } from './campfires.js';
import { isNight } from './daylight.js';
import { HOTBAR_SIZE, ITEMS } from './inventory.js';
import { ANIMAL_DROPS, AXE_COOLDOWN, BOW_COOLDOWN, BOW_DRAW_TIME, BOW_MIN_DRAW, BUTCHER_TIME, KNIFE_COOLDOWN, arrowFlight, hitAnimal, knifeHitTest } from './hunting.js';
import { BERRY_HUNGER, hasBerries, regrowLeft } from './foraging.js';

const COOK_TIME = 3; // seconds of holding the mouse button at a fire to cook one piece of meat
const SEARCH_TIME = 1.5; // seconds of holding E to search a suitcase
const EAT_TIME = 1.2; // seconds of holding the mouse button to eat something
const BANDAGE_TIME = 2.5; // ...and to bandage yourself up
const WARMTH_REACH = 3; // how close to a burning fire warms you up, in meters
const WET_DEPTH = 0.3; // water this deep (in meters) chills you
const BANDAGE_HEALING = 30;
// Up a building (the lookout tower) more than this far above the ground, things down on the
// ground are out of reach, and you can't put things down. (Higher than the tallest rock.)
const UP_HIGH = 2.5;
const FLASK_DRINK = 35; // thirst one drink from the flask restores
// What eating each food does to hunger and health.
const FOOD = {
  cookedMeat: { hunger: 35, health: 0, message: 'Delicious' },
  rawMeat: { hunger: 12, health: -15, message: 'You feel sick' },
  berries: { hunger: BERRY_HUNGER, health: 0, message: 'Tart, but it helps' }, // no spoiling in v1 (#74)
};

// Works out what the player is doing each frame (drinking, chopping, building,
// trapping, cooking, eating) and what to tell them.
export function createActions({ sfx = () => {}, input, inventory, player, world, wreck, lookout, pois, campfires, shelters, traps, pickups, bushes, animals, arrows, survival, hud, onSleep, onBinoculars, onDressed, aimPoint }) {
  let cooking = 0;
  let searching = 0;
  let using = 0; // seconds spent eating or bandaging so far
  let usingItem = null;
  let butchering = 0;
  let bowReady = 0; // seconds until the bow can shoot again
  let drawing = 0; // seconds the bow has been drawn for (0 when not drawing)
  let chopBeat = 0; // seconds into the current axe swing (for the sound of it biting)
  const CHOP_BEAT = 0.83; // one swing of player.glb's chop animation
  let knifeReady = 0; // seconds until the knife can stab again
  let axeReady = 0; // seconds until the axe can swing at an animal again

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
    // Up the lookout tower, the ground (and everything on it) is out of reach.
    const upHigh = player.feet - world.terrain.heightAt(x, z) > UP_HIGH;
    // Up there, or down in a cave, things on the land around are out of reach.
    const offGround = upHigh || Boolean(player.cave);
    const onGround = (thing) => (offGround ? null : thing);
    const canDrink = !offGround && player.canDrink(world);
    const drinking = canDrink && input.isDown('KeyE');
    const fire = onGround(campfires.near(x, z, 1.2));
    const trap = onGround(traps.near(x, z, 1.3));
    const pile = onGround(pickups.near(x, z, 1.3));
    // Somewhere to search: a suitcase at the wreck, or the lookout tower's supply crate.
    const crate = lookout.near(x, z, 1.8, player.feet);
    const poiContainer = crate ? null : pois.near(x, z, 1.4, player.feet); // in a cabin, a cave or up a stand
    const container = crate ?? poiContainer ?? onGround(wreck.near(x, z, 1.8));
    const carcass = onGround(animals.carcassNear(x, z, 1.8));
    let searchingNow = false;
    let butcheringNow = false;
    bowReady = Math.max(0, bowReady - dt);
    knifeReady = Math.max(0, knifeReady - dt);
    const bush = onGround(bushes.near(x, z, 1.4));
    const now = survival.minutesSurvived;
    const tree = onGround(player.treeInReach(world));
    // A living animal right in front of you takes the axe instead of a tree (a boar coming at you).
    const axeTarget = held === 'axe' && !offGround && !player.swimming ? knifeHitTest(x, z, player.facing, animals.all.filter((a) => !a.dead)) : null;
    axeReady = Math.max(0, axeReady - dt);
    const chopping = Boolean(tree && held === 'axe' && input.usingTool() && !player.airborne && !axeTarget);
    let prompt = null;
    let progress = null;
    let cookingNow = false;
    let usingNow = false;
    let drawingNow = false;
    let busy = null; // what the player's hands are doing, for their pose (see Player.busy)
    // Hold the mouse button for `time` seconds to use the held item. True once it's done.
    const holdToUse = (time) => {
      usingNow = input.usingTool();
      if (usingItem !== held) using = 0;
      usingItem = held;
      using = usingNow ? using + dt : 0;
      progress = using / time;
      if (using < time) return false;
      using = 0;
      return true;
    };

    if (fire) {
      // Tending a fire: E lights it (with a lighter) or adds a log.
      // Raw meat in hand: hold the mouse button to cook it.
      const wood = inventory.count('wood');
      const hasLighter = inventory.count('lighter') > 0;
      const needsLighting = !campfires.isBurning(fire) && fire.fuel > 0;
      if (pressedE && needsLighting && hasLighter) {
        campfires.light(fire);
        sfx('fire-light', fire);
        hud.toast('The fire catches');
      } else if (pressedE && !needsLighting && wood > 0 && campfires.addWood(fire)) {
        inventory.remove('wood', 1);
        sfx('add-wood', fire);
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
        // The backpack isn't stored in a slot: finding it gives you its extra slots, with
        // whatever was in it when you put it down.
        pickups.remove(pile);
        inventory.putOnBackpack(pile.contents);
        sfx('cloth');
        hud.toast(pile.contents ? 'You put your backpack back on' : 'Found a backpack! Press Tab to open it');
      } else if (pressedE) {
        const taken = pickups.pickUp(pile, inventory);
        if (taken > 0) sfx('pickup');
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
      if (butcheringNow) busy = 'butcher';
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
      // Crouch down to search things on the floor; stand to search a locker.
      if (searchingNow) busy = container.standing ? 'search' : 'searchLow';
      if (searching >= SEARCH_TIME) {
        searching = 0;
        if (container.note) hud.toast(`You found ${container.note}`);
        const source = crate ? lookout : poiContainer ? pois : wreck;
        const loot = source.search(container);
        sfx('pickup');
        if (loot.length === 0) hud.toast(`${container.label[0].toUpperCase()}${container.label.slice(1)} is empty`);
        for (const [item, count] of loot) give(item, count, container.x, container.z);
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
    } else if (offGround && (held === 'campfire' || held === 'shelter' || held === 'trap')) {
      prompt = player.cave ? "You can't put that down in here" : "You can't put that down up here";
    } else if (player.cave && held === 'bow') {
      prompt = 'No room to shoot down here';
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
        sfx('trap-set', spot);
        hud.toast('Trap set. Rabbits nearby will be drawn to it.');
      } else {
        prompt = 'Click to set the trap';
      }
    } else if (!fire && held === 'bandage') {
      if (survival.health >= 100) {
        prompt = "You're not hurt";
      } else {
        const done = holdToUse(BANDAGE_TIME);
        prompt = usingNow ? 'Bandaging…' : `Click and hold to use a bandage (+${BANDAGE_HEALING} health)`;
        if (usingNow) busy = 'bandage';
        if (done) {
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
    } else if (!fire && ITEMS[held]?.wear) {
      // Clothes: click to put them on. Whatever you had on goes into the slot they came from.
      const name = ITEMS[held].name.toLowerCase();
      prompt = `Click to put on the ${name}`;
      if (input.startedUsingTool()) {
        const old = inventory.outfit;
        inventory.slots[inventory.selected] = old ? { item: old, count: 1 } : null;
        inventory.outfit = held;
        hud.toast(held === 'parka' ? 'You pull on the hide parka. Much warmer.' : `You put on the ${name}`);
        sfx('cloth');
        onDressed(held);
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
          sfx('step-water');
          hud.toast('Flask filled');
        }
      } else if (flask.water === 0) {
        prompt = 'The flask is empty · fill it at the lake or river';
      } else {
        prompt = `Water flask ${flask.water}/${holds} · click to drink`;
        if (input.startedUsingTool()) {
          flask.water -= 1;
          survival.drink(FLASK_DRINK);
          sfx('gulp');
          hud.toast('Refreshing');
        }
      }
    } else if (!fire && held === 'bow') {
      // Hold the mouse button to draw the bow, turning to face where you aim; let go to shoot.
      // Each shot wears the bow down.
      const bow = inventory.slots[inventory.selected];
      const arrowsLeft = inventory.count('arrow');
      const target = aimPoint();
      if (arrowsLeft === 0) {
        prompt = 'No arrows · craft them from wood and stone (Tab)';
      } else if (input.usingTool() && bowReady === 0 && !player.swimming) {
        drawingNow = true;
        if (drawing === 0) sfx('bow-draw');
        drawing = Math.min(BOW_DRAW_TIME, drawing + dt);
        const draw = drawing / BOW_DRAW_TIME;
        if (target) player.facing = Math.atan2(target.x - x, target.z - z);
        const { range } = arrowFlight(draw);
        const away = target ? Math.hypot(target.x - x, target.z - z) : 0;
        progress = draw;
        busy = 'draw';
        player.drawAmount = draw;
        prompt = draw < BOW_MIN_DRAW ? 'Drawing…' : `${draw >= 1 ? 'Fully drawn' : 'Drawing…'} · reaches ${Math.round(range)} m${away > range ? ' (not that far)' : ''} · let go to shoot`;
      } else if (drawing > 0) {
        // Let go: loose the arrow (unless the bow was barely drawn).
        const draw = drawing / BOW_DRAW_TIME;
        if (draw >= BOW_MIN_DRAW) {
          bowReady = BOW_COOLDOWN;
          inventory.remove('arrow', 1);
          const from = player.ahead(0.5);
          const aim = target ?? player.ahead(30);
          arrows.fire(from.x, from.z, aim.x, aim.z, draw);
          sfx('bow-shoot');
          bow.durability -= 1;
          if (bow.durability <= 0) {
            inventory.slots[inventory.selected] = null;
            hud.toast('Your bow snapped');
          }
        }
        prompt = `Bow ${bow.durability}/${ITEMS.bow.durability} · ${arrowsLeft} arrows · hold the mouse button to draw, let go to shoot`;
      } else {
        prompt = `Bow ${bow.durability}/${ITEMS.bow.durability} · ${arrowsLeft} arrows · hold the mouse button to draw, let go to shoot`;
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
      const done = holdToUse(EAT_TIME);
      prompt = usingNow ? 'Eating…' : 'Click and hold to eat';
      if (usingNow) busy = 'eat';
      if (done) eat('cookedMeat');
    } else if (!fire && held === 'rawMeat') {
      const done = holdToUse(EAT_TIME);
      prompt = usingNow ? 'Eating…' : 'Cook it at a campfire · hold the mouse button to eat it raw (risky)';
      if (usingNow) busy = 'eat';
      if (done) eat('rawMeat');
    } else if (!fire && held === 'berries') {
      const done = holdToUse(EAT_TIME);
      prompt = usingNow ? 'Eating…' : `Click and hold to eat (+${BERRY_HUNGER} hunger)`;
      if (usingNow) busy = 'eat';
      if (done) eat('berries');
    }

    // The axe: click or hold to swing it at an animal right in front of you.
    if (axeTarget && input.usingTool() && axeReady === 0 && !player.airborne) {
      axeReady = AXE_COOLDOWN;
      player.swingAxe();
      sfx('arrow-hit', axeTarget.position);
      if (hitAnimal(axeTarget, 'axe')) {
        animals.kill(axeTarget);
        hud.toast(`You killed a ${axeTarget.kind}! Hold E next to it to butcher it`);
      } else hud.toast(`You hit the ${axeTarget.kind} with your axe`);
    }

    // Stone knife (#75): click or hold to stab whatever's right in front of you. Only stabs
    // that land wear it down. Works next to a carcass or bush too, so you can fight a boar there.
    if (held === 'knife' && input.usingTool() && knifeReady === 0 && !player.swimming && !player.airborne) {
      knifeReady = KNIFE_COOLDOWN;
      player.stab();
      sfx('stab');
      const target = offGround ? null : knifeHitTest(x, z, player.facing, animals.all);
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
    if (!usingNow) using = 0;
    if (!drawingNow) drawing = 0;
    if (!butcheringNow) butchering = 0;
    // The axe bites once per swing, partway through it.
    const beat = chopBeat;
    chopBeat = chopping ? (chopBeat + dt) % CHOP_BEAT : 0;
    if (chopping && beat < CHOP_BEAT * 0.45 && chopBeat >= CHOP_BEAT * 0.45) sfx('chop', tree.spot);
    if (chopping && world.trees.chop(tree, dt, x, z)) {
      // It creaks, then crashes down (see Trees: FALL_TIME).
      const at = { x: tree.spot.x, z: tree.spot.z };
      sfx('tree-creak', at);
      setTimeout(() => sfx('tree-fall', at), 1050); // (tree-fall.mp3's crash is 0.25 s in: it lands with the tree, at FALL_TIME)
      // Wood that doesn't fit lands where the tree fell, a little beyond the stump.
      const away = Math.atan2(tree.spot.x - x, tree.spot.z - z);
      give('wood', tree.wood, tree.spot.x + Math.sin(away) * 1.6, tree.spot.z + Math.cos(away) * 1.6);
    }
    // (With a flask in hand, the flask's prompt already says how to drink here.)
    if (canDrink && !(held === 'flask' && !drinking)) prompt = drinking ? 'Drinking…' : 'Hold E to drink';

    // Under a shelter you're warm, and at night E sleeps until morning.
    // So are you inside a cabin or a cave.
    const place = pois.shelterAt(x, z, player.feet, player.cave);
    const shelter = shelters.around(x, z) ?? place;
    if (shelter && !prompt) {
      const night = isNight(survival.hourOfDay);
      const name = { cabin: 'Cabin', cave: 'Cave', leanto: 'Lean-to' }[place?.kind] ?? 'Shelter';
      prompt = night ? `${name} · warmer in here · E to sleep until morning` : `${name} · warmer in here`;
      if (night && pressedE) onSleep();
    }

    // Butchering, you work with your knife if you have one, whatever's in your hand.
    const inHand = busy === 'butcher' && inventory.count('knife') > 0 ? 'knife' : inventory.selectedItem;
    player.setAction(inHand, chopping, drinking, inventory.hasBackpack, busy);
    const warmFire = offGround ? null : campfires.near(x, z, WARMTH_REACH);
    const nearFire = Boolean(warmFire && campfires.isBurning(warmFire));
    const wet = !player.cave && world.terrain.waterDepth(x, z) > WET_DEPTH;
    const cold = player.cave ? 0 : world.terrain.coldAt(x, z); // up the mountains (not down a cave)
    return {
      drinking, working: chopping, fire: nearFire, shelter: Boolean(shelter), wet, cold, outfit: inventory.outfit, prompt, progress,
      // (What the player's busy with, for the sounds.)
      cooking: cookingNow, eating: busy === 'eat', searching: searchingNow, bandaging: busy === 'bandage',
    };
  };
}
