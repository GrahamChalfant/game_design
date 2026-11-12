import { BURN_TIME, COOK_TIME, SPIT_HOLDS, formatFuel, meatAfter } from './campfires.js';
import { isNight } from './daylight.js';
import { HOTBAR_SIZE, ITEMS } from './inventory.js';
import { ANIMAL_DROPS, AXE_COOLDOWN, BOW_COOLDOWN, BOW_DRAW_TIME, BOW_MIN_DRAW, BUTCHER_TIME, KNIFE_COOLDOWN, arrowFlight, hitAnimal, knifeHitTest } from './hunting.js';
import { BERRY_HUNGER, hasBerries, regrowLeft } from './foraging.js';
import { CUT_TIME } from './trees.js';
import { PLACEABLES } from './placement.js';

const SEARCH_TIME = 1.5; // seconds of holding E to search a suitcase
const EAT_TIME = 1.2; // seconds of holding the mouse button to eat something
const BANDAGE_TIME = 2.5; // ...and to bandage yourself up
const SPIT_TIME = 1; // ...and to put a piece of meat on a spit, or take one off (not by accident)
const WARMTH_REACH = 3; // how close to a burning fire warms you up, in meters
const BUTCHER_REACH = 0.75; // butchering, you step up to this close to the carcass...
const BUTCHER_STEP = 3; // ...at this many meters a second
const WET_DEPTH = 0.3; // water this deep (in meters) chills you
const BANDAGE_HEALING = 30;
// Up a building (the lookout tower) more than this far above the ground, things down on the
// ground are out of reach, and you can't put things down. (Higher than the tallest rock.)
const UP_HIGH = 2.5;
const FLASK_DRINK = 35; // thirst one drink from the flask restores
const FULL = 95; // with hunger (or thirst) this high you're full: you won't eat (or drink) more
// What eating each food does to hunger and health.
const FOOD = {
  cookedMeat: { hunger: 35, health: 0, message: 'Delicious' },
  burntMeat: { hunger: 10, health: 0, message: 'Charred and bitter' },
  rawMeat: { hunger: 12, health: -15, message: 'You feel sick' },
  berries: { hunger: BERRY_HUNGER, health: 0, message: 'Tart, but it helps' }, // no spoiling in v1 (#74)
};

// Works out what the player is doing each frame (drinking, chopping, building,
// trapping, cooking, eating) and what to tell them.
export function createActions({ sfx = () => {}, input, inventory, player, world, wreck, lookout, pois, campfires, shelters, traps, pickups, bushes, animals, arrows, survival, hud, onSleep, onBinoculars, onDressed, onOpenContainer, aimPoint, launchPoint, lookRay, groundAim, placementGhost }) {
  let searching = 0;
  let using = 0; // seconds spent eating or bandaging so far
  let usingItem = null;
  let spitDone = false; // a piece of meat just went on or came off the spit (let go before the next)
  let spitAim = null; // what the hold at the spit is for (looking away to another piece starts it again)
  let butchering = 0;
  let bowReady = 0; // seconds until the bow can shoot again
  let drawing = 0; // seconds the bow has been drawn for (0 when not drawing)
  let chopBeat = 0; // seconds into the current axe swing (for the sound of it biting)
  let cutBeat = 0; // seconds into the current knife stroke, cutting sticks
  const CHOP_BEAT = 0.83; // one swing of player.glb's chop animation
  let knifeReady = 0; // seconds until the knife can stab again
  let axeReady = 0; // seconds until the axe can swing again
  let drinkingBefore = false; // drinking at the water last frame
  // Putting something down (a campfire, shelter or trap): the first click shows its ghost where
  // it'll go; then you hold the mouse button to build it there.
  let previewing = null; // the item whose ghost is showing
  let buildArmed = false; // let go since the click that showed it (so that click doesn't build it too)
  let building = 0; // seconds spent building it so far

  // Where a placeable goes: where you aim on the ground, kept between its nearest and furthest
  // (looking at the sky, as far ahead as it goes), on the ground there.
  const placeSpot = (item) => {
    const { x, z } = player.position;
    const { near, far } = PLACEABLES[item];
    const aim = groundAim();
    let dx = aim ? aim.x - x : 0;
    let dz = aim ? aim.z - z : 0;
    let away = Math.hypot(dx, dz);
    if (!aim) {
      // Looking up: straight on, the way you look.
      const { direction } = lookRay();
      [dx, dz, away] = [direction.x, direction.z, far * Math.hypot(direction.x, direction.z)];
    }
    if (Math.hypot(dx, dz) < 0.01) [dx, dz] = [Math.sin(player.facing), Math.cos(player.facing)];
    const along = Math.min(far, Math.max(near, away)) / Math.hypot(dx, dz);
    const spot = { x: x + dx * along, z: z + dz * along };
    spot.y = world.terrain.heightAt(spot.x, spot.z);
    return spot;
  };
  const canPlace = (item, spot) =>
    item === 'campfire' ? campfires.canBuildAt(spot.x, spot.z) : item === 'shelter' ? shelters.canBuildAt(spot.x, spot.z) : traps.canPlaceAt(spot.x, spot.z);
  const NO_ROOM = { campfire: 'No room for a campfire here', shelter: 'Not enough open ground for a shelter here', trap: 'No room for a trap here' };
  // Builds it (the hold's done), facing `heading`.
  const putDown = (item, spot, heading) => {
    inventory.remove(item, 1);
    player.reach();
    if (item === 'campfire') {
      campfires.build(spot.x, spot.z);
      sfx('add-wood', spot);
    } else if (item === 'shelter') {
      shelters.build(spot.x, spot.z);
      sfx('add-wood', spot);
      hud.toast('Shelter built. Sleep in it at night (E)');
    } else {
      traps.place(spot.x, spot.z, heading);
      sfx('trap-set', spot);
      hud.toast('Trap set. Rabbits nearby will be drawn to it.');
    }
  };

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

  // Lighting takes a moment, holding the mouse button (and the hands show it: see handView.js):
  // a campfire with the lighter or the matches in your hand; a torch in your hand with a lighter
  // or a match from your pocket (in your other hand), or held in a burning campfire.
  const LIGHT_FIRE_TIME = { lighter: 1.6, matches: 2.2 }; // seconds
  const LIGHT_TORCH_TIME = { lighter: 1.4, matches: 1.9, fire: 1.3 };
  // What you can light a torch with: your lighter, or else a match (one used up each time).
  // Null if you've neither.
  const fireStarter = () => (inventory.count('lighter') > 0 ? 'lighter' : inventory.count('matches') > 0 ? 'matches' : null);
  const withStarter = (starter) => (starter === 'lighter' ? 'with your lighter' : 'with a match');
  // Uses up a match if that's what you lit it with, with the sound of it catching.
  const strike = (starter, at) => {
    if (starter === 'matches') {
      inventory.remove('matches', 1);
      hud.toast(`-1 match (${inventory.count('matches')} left)`);
    }
    sfx('fire-light', at);
  };
  // The torch in your hand catches: from a burning fire, or struck with `starter`.
  const lightTorch = (starter = null) => {
    if (starter) strike(starter);
    inventory.remove('torch', 1);
    give('litTorch', 1);
    hud.toast('The torch catches');
  };

  const eat = (food) => {
    inventory.remove(food, 1);
    survival.eat(FOOD[food].hunger, FOOD[food].health);
    hud.toast(FOOD[food].message);
  };

  return function update(dt) {
    if (!survival.alive) {
      placementGhost.hide();
      return { prompt: null };
    }
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) inventory.select(i);
    }

    const held = inventory.selectedItem;
    // Switching to something else takes the ghost away.
    if (previewing !== held) {
      previewing = null;
      building = 0;
    }
    let ghostShown = false;
    const { x, z } = player.position;
    const pressedE = input.wasPressed('KeyE');
    // Up the lookout tower, the ground (and everything on it) is out of reach.
    const upHigh = player.feet - world.terrain.heightAt(x, z) > UP_HIGH;
    // Up there, or down in a cave, things on the land around are out of reach.
    const offGround = upHigh || Boolean(player.cave);
    const onGround = (thing) => (offGround ? null : thing);
    const canDrink = !offGround && player.canDrink(world);
    // You drink until you've had enough (and won't start when you're not thirsty).
    const thirsty = survival.thirst < (drinkingBefore ? 100 : FULL);
    const drinking = canDrink && thirsty && input.isDown('KeyE');
    drinkingBefore = drinking;
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
    // A living animal right in front of you takes the axe instead of a tree.
    const axeTarget = held === 'axe' && !offGround && !player.swimming ? knifeHitTest(x, z, player.facing, animals.all.filter((a) => !a.dead)) : null;
    axeReady = Math.max(0, axeReady - dt);
    const chopping = Boolean(tree && held === 'axe' && input.usingTool() && !player.airborne && !axeTarget);
    // A felled tree lying in front of you (or at your feet): the axe cuts it into logs and sticks.
    const ahead = player.ahead(0.6);
    const down = !tree && !offGround ? world.trees.findDown(ahead.x, ahead.z) : null;
    const bucking = Boolean(down && held === 'axe' && input.usingTool() && !player.airborne && !player.swimming && !axeTarget);
    // A young tree in front of you, with the knife in hand: hold to cut sticks from it (unless
    // there's an animal right there to stab).
    const knifeTarget = held === 'knife' && !offGround ? knifeHitTest(x, z, player.facing, animals.all.filter((a) => !a.dead)) : null;
    const sapling = held === 'knife' && tree?.small && !knifeTarget ? tree : null;
    const cuttingSticks = Boolean(sapling && sapling.cutsLeft > 0 && input.usingTool() && !player.airborne);
    let prompt = null;
    let progress = null;
    let clickUsed = false; // the click went to the fire's spit (so it doesn't swing the axe too)
    let usingNow = false;
    let drawingNow = false;
    let busy = null; // what the player's hands are doing, for their pose (see Player.busy)
    let busyWith = null; // ...and, lighting something, what with
    let busyProgress = 0;
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
    // Hold the mouse button to light the torch in your hand from `source` (a lighter, matches, or
    // 'fire': a burning campfire). Returns the prompt while you're at it.
    const lightTorchFrom = (source) => {
      const done = holdToUse(LIGHT_TORCH_TIME[source]);
      if (usingNow) {
        busy = 'lightTorch';
        busyWith = source;
        busyProgress = progress;
        clickUsed = true;
      }
      if (done) lightTorch(source === 'fire' ? null : source);
      if (usingNow) return source === 'fire' ? 'Holding the torch in the flames…' : 'Lighting the torch…';
      return source === 'fire' ? 'Click and hold to light the torch in the fire' : `Click and hold to light the torch ${withStarter(source)}`;
    };

    if (fire) {
      // Tending a fire: E lights it (with a lighter or a match) or adds a log.
      // Raw meat in hand: hold the mouse button to cook it.
      // Fuel: a log if you've one (it burns longer), else a stick.
      const wood = inventory.count('wood');
      const sticks = inventory.count('stick');
      const fuel = wood > 0 ? 'wood' : sticks > 0 ? 'stick' : null;
      const addFuel = fuel === 'wood' ? 'E to add a log' : fuel ? 'E to add a stick' : null;
      const starter = fireStarter();
      // What you're looking at: a piece of meat on the spit (or an empty place on it), or else
      // the fire itself. Looking at the meat, you take the meat; at the fire, you tend the fire.
      const look = fire.spit ? campfires.spitPlaceAt(fire, lookRay()) : null;
      const atMeat = look?.piece ?? null;
      // (To light a fire you need the lighter or the matches in your hand.)
      const inHand = held === 'lighter' || held === 'matches' ? held : null;
      const needsLighting = !campfires.isBurning(fire) && fire.fuel > 0;
      let lighting = false;
      if (needsLighting && inHand) {
        const done = holdToUse(LIGHT_FIRE_TIME[inHand]);
        lighting = usingNow;
        if (usingNow) {
          busy = 'lightFire';
          busyWith = inHand;
          busyProgress = progress;
          clickUsed = true;
        }
        if (done) {
          campfires.light(fire);
          strike(inHand, fire);
          hud.toast('The fire catches');
        }
      } else if (pressedE && !atMeat && !needsLighting && fuel && campfires.addWood(fire, fuel)) {
        player.reach();
        inventory.remove(fuel, 1);
        sfx('add-wood', fire);
        hud.toast(fuel === 'wood' ? '-1 Log' : '-1 Stick');
      }
      const burning = campfires.isBurning(fire);
      let status;
      let tend;
      if (burning) {
        status = `Campfire: ${formatFuel(fire.fuel)} left`;
        tend = addFuel ?? 'no wood to add';
      } else if (fire.fuel > 0) {
        status = 'Campfire: not lit';
        if (lighting) tend = 'lighting it…';
        else if (inHand) tend = `click and hold to light it ${withStarter(inHand)}`;
        else if (starter) tend = `select your ${starter === 'lighter' ? 'lighter' : 'matches'} to light it`;
        else tend = 'you need a lighter or matches to light it';
      } else {
        status = 'The fire is out';
        tend = addFuel ?? 'it needs wood: logs or sticks';
      }
      // Cooking: set a spit up over the fire, put raw meat on it (up to SPIT_HOLDS pieces), and
      // take each off once it's cooked (COOK_TIME), before it burns (BURN_TIME). Putting a piece
      // on or taking one off is a hold of the mouse button (SPIT_TIME), not a click, so it's
      // never done by accident; you take the piece you're looking at, whatever's in hand.
      const { spit } = fire;
      const pieces = campfires.meatOn(fire);
      const onSpit = pieces.length === 1 ? 'meat on the spit' : `${pieces.length} pieces on the spit`;
      prompt = pieces.length ? `${status} · ${tend} · ${onSpit}: look at a piece to take it off` : `${status} · ${tend}`;
      // Holding it: the hand reaches out to the spit as the hold comes to an end.
      // (One piece a press: after one's on or off, let go before the next.)
      const holdAtSpit = (aim) => {
        if (spitDone && input.usingTool()) {
          clickUsed = true;
          return false;
        }
        spitDone = false;
        if (aim !== spitAim) using = 0;
        spitAim = aim;
        const reached = usingItem === held && using / SPIT_TIME >= 0.5;
        const done = holdToUse(SPIT_TIME);
        if (usingNow) clickUsed = true;
        if (usingNow && (done || progress >= 0.5) && !reached) player.reach();
        if (done) spitDone = true;
        return done;
      };
      if (atMeat) {
        // Looking at a piece of meat: how it's coming on, and hold to take it off.
        const { cooked } = atMeat;
        const state = meatAfter(cooked);
        const take = 'hold the mouse button to take it off';
        if (holdAtSpit(atMeat)) give(campfires.takeMeat(fire, atMeat), 1);
        if (state === 'rawMeat') {
          if (!usingNow) progress = cooked / COOK_TIME;
          prompt = burning ? `Meat cooking… ${Math.ceil(COOK_TIME - cooked)} s · ${take}` : `Meat on the spit · light the fire to cook it · ${take}`;
        } else if (state === 'cookedMeat') {
          prompt = cooked > BURN_TIME - 15 && burning ? `It's starting to burn! · ${take}` : `Cooked! · ${take} before it burns`;
        } else prompt = `The meat's burnt · ${take}`;
        if (usingNow) prompt = 'Taking the meat off the spit…';
      } else if (held === 'rawMeat' && spit && campfires.spitHasRoom(fire)) {
        // Raw meat in hand: on it goes (where you're looking along the skewer, if that's free).
        const on = pieces.length ? ` (${pieces.length + 1} of ${SPIT_HOLDS})` : '';
        const verb = usingNow || using > 0 ? 'Putting the meat on the spit…' : `Click and hold to put the meat on the spit${on}`;
        prompt = burning ? `${verb} · ${tend}` : `${verb} · light the fire to cook it`;
        if (holdAtSpit('put')) {
          inventory.remove('rawMeat', 1);
          campfires.putMeatAt(fire, look?.place);
          sfx('rummage', fire);
        }
      } else if (held === 'rawMeat' && spit) {
        prompt = `The spit's full · look at a piece to take it off · ${tend}`;
      } else if (held === 'spit' && !spit) {
        prompt = `Click to set the spit up over the fire · ${tend}`;
        if (input.startedUsingTool()) {
          clickUsed = true;
          inventory.remove('spit', 1);
          player.reach();
          campfires.addSpit(fire, player.facing);
          sfx('add-wood', fire);
          hud.toast('The spit is up. Put raw meat on it to cook');
        }
      } else if (held === 'spit') {
        prompt = `This fire has a spit already · ${tend}`;
      } else if (held === 'rawMeat') {
        prompt = `${status} · you need a spit to cook on: craft one (Tab, 3 wood)`;
      } else if (held === 'torch' && burning) {
        prompt = `${lightTorchFrom('fire')} · ${tend}`;
      } else if (held === 'torch' && starter) {
        prompt = `${lightTorchFrom(starter)} · ${tend}`;
      } else if (held === 'torch') {
        prompt = `${status} · light it, or find a lighter or matches, to light your torch`;
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
        player.reach();
        pickups.remove(pile);
        inventory.putOnBackpack(pile.contents);
        sfx('cloth');
        hud.toast(pile.contents ? 'You put your backpack back on' : 'Found a backpack! Press Tab to open it');
      } else if (pressedE) {
        player.reach();
        const taken = pickups.pickUp(pile, inventory);
        if (taken > 0) sfx('pickup');
        hud.toast(taken > 0 ? `+${taken} ${name}` : 'Inventory full');
      }
    } else if (!fire && bush && hasBerries(bush, now)) {
      // A berry bush in fruit: E picks a handful.
      prompt = 'Berry bush · E to pick berries';
      if (pressedE) {
        player.reach();
        give('berries', bushes.pick(bush, now), bush.x, bush.z);
      }
    } else if (!fire && carcass) {
      // A shot animal: hold E to butcher it for meat, hide and intestines, with your knife in
      // your hand (you can't cut it up without one).
      const time = BUTCHER_TIME[carcass.kind];
      const knife = held === 'knife';
      butcheringNow = knife && input.isDown('KeyE');
      if (butcheringNow) {
        busy = 'butcher';
        // Step up to it and face it, so your hands are on it (you can start from 1.8 m off).
        const dx = carcass.position.x - x;
        const dz = carcass.position.z - z;
        const away = Math.hypot(dx, dz);
        if (away > BUTCHER_REACH) {
          const step = Math.min(away - BUTCHER_REACH, BUTCHER_STEP * dt);
          player.tryMove((dx / away) * step, 0, world);
          player.tryMove(0, (dz / away) * step, world);
        }
        if (away > 0.05) player.facing = Math.atan2(dx, dz);
      }
      butchering = butcheringNow ? butchering + dt : 0;
      progress = butchering / time;
      if (butcheringNow) prompt = 'Butchering…';
      else if (knife) prompt = `A dead ${carcass.kind} · hold E to butcher it`;
      else if (inventory.count('knife') > 0) prompt = `A dead ${carcass.kind} · select your knife to butcher it`;
      else prompt = `A dead ${carcass.kind} · you need a knife to butcher it (craft one: Tab)`;
      if (butchering >= time) {
        butchering = 0;
        const { x: cx, z: cz } = carcass.position;
        animals.remove(carcass);
        for (const [item, count] of Object.entries(ANIMAL_DROPS[carcass.kind])) give(item, count, cx, cz);
      }
    } else if (!fire && pois.telescopeNear(x, z, player.feet)) {
      // The observatory terrace's telescope: E to look out through it, over the lake.
      prompt = 'Telescope · E to look through it';
      if (pressedE) onBinoculars(pois.telescopeNear(x, z, player.feet));
    } else if (!fire && lookout.binocularsNear(x, z, player.feet)) {
      // The lookout's binoculars: E to look through them and see far across the land.
      prompt = 'Binoculars · E to look through them';
      if (pressedE) onBinoculars();
    } else if (!fire && container?.searched && container.contents?.length) {
      // Searched already, with things left in it: E opens it in the menu straight away.
      prompt = `${container.label[0].toUpperCase()}${container.label.slice(1)} · E to look inside`;
      if (pressedE) onOpenContainer(container);
    } else if (!fire && container && !container.searched) {
      // Hold E to search a suitcase: once you have, it opens in the menu, to take what you want.
      searchingNow = input.isDown('KeyE');
      searching = searchingNow ? searching + dt : 0;
      progress = searching / SEARCH_TIME;
      prompt = searchingNow ? 'Searching…' : `Hold E to search ${container.label}`;
      // Crouch down to search things on the floor; stand to search a locker.
      if (searchingNow) busy = container.standing ? 'search' : 'searchLow';
      if (searching >= SEARCH_TIME) {
        searching = 0;
        if (container.note) hud.toast(`You found ${container.note}`);
        if (container.read) hud.say(container.read, 12); // (a note: read it out)
        const source = crate ? lookout : poiContainer ? pois : wreck;
        const loot = source.search(container);
        sfx('pickup');
        // (What's inside stays inside until you take it: { item, count } each.)
        container.contents = loot.map(([item, count]) => ({ item, count }));
        if (loot.length === 0) {
          if (!container.read) hud.toast(`${container.label[0].toUpperCase()}${container.label.slice(1)} is empty`); // (a notice to read has nothing in it)
        } else onOpenContainer(container);
      }
    } else if (!fire && trap) {
      // At a trap: E takes the catch out, or picks the empty trap back up.
      if (trap.caught) {
        prompt = `A ${trap.caught} is caught! · E to take it`;
        if (pressedE) {
          // Taking the catch out breaks the trap: you'll need to craft another.
          player.reach();
          const caught = traps.collect(trap);
          traps.remove(trap);
          for (const [item, count] of Object.entries(ANIMAL_DROPS[caught])) give(item, count, trap.x, trap.z);
          hud.toast('The trap broke');
        }
      } else {
        prompt = 'Trap is set · E to pick it up';
        if (pressedE) {
          player.reach();
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
      prompt = chopping ? 'Chopping…' : 'Click and hold to chop it down';
      progress = world.trees.progress(tree);
    } else if (!fire && down && held === 'axe') {
      const left = down.tree.piecesLeft;
      prompt = bucking ? 'Cutting it up…' : `Fallen tree · click and hold to cut it up (${left} more ${down.tree.sticksOnly ? 'bundle' : 'log'}${left > 1 ? 's' : ''})`;
      progress = world.trees.buckProgress(down.tree);
    } else if (!fire && down && !held) {
      prompt = inventory.count('axe') > 0 ? 'A fallen tree · take out your axe to cut it up' : 'A fallen tree · you need an axe to cut it up';
    } else if (!fire && sapling) {
      if (sapling.cutsLeft <= 0) prompt = 'No good branches left on this one';
      else {
        prompt = cuttingSticks ? 'Cutting sticks…' : 'Young tree · click and hold to cut sticks';
        progress = cuttingSticks ? sapling.cutting / CUT_TIME : null;
      }
    } else if (offGround && PLACEABLES[held]) {
      prompt = player.cave ? "You can't put that down in here" : "You can't put that down up here";
    } else if (player.cave && held === 'bow') {
      prompt = 'No room to shoot down here';
    } else if (!fire && PLACEABLES[held]) {
      // A crafted campfire, shelter or trap: click to see its ghost on the ground where you aim
      // (red where it can't go), then hold the mouse button to build it there. Right-click, or
      // switching to something else, puts it away again.
      const name = ITEMS[held].name.toLowerCase();
      if (previewing && input.wasPressed('MouseRight')) {
        previewing = null;
        building = 0;
      } else if (!previewing && input.startedUsingTool()) {
        previewing = held;
        buildArmed = false;
        building = 0;
      }
      if (!previewing) {
        prompt = `Click to choose where to put the ${name}`;
      } else {
        const spot = placeSpot(held);
        const ok = canPlace(held, spot);
        // (The shelter's open front always faces the camera, south; a trap faces away from you.)
        const heading = held === 'trap' ? Math.atan2(spot.x - x, spot.z - z) : 0;
        if (!input.usingTool()) buildArmed = true;
        const holding = buildArmed && ok && input.usingTool();
        building = holding ? building + dt : 0;
        const { buildTime } = PLACEABLES[held];
        if (holding) {
          progress = building / buildTime;
          clickUsed = true;
          busy = held === 'shelter' ? 'search' : 'searchLow'; // (down on your knees to build a fire or set a trap)
        }
        if (building >= buildTime) {
          putDown(held, spot, heading);
          previewing = null;
          building = 0;
          progress = null;
        } else {
          placementGhost.show(held, spot, heading, ok, holding ? progress : 0);
          ghostShown = true;
          if (!ok) prompt = `${NO_ROOM[held]} · aim somewhere else · right-click to cancel`;
          else if (holding) prompt = `Building the ${name}…`;
          else prompt = `Hold the mouse button to build the ${name} here · right-click to cancel`;
        }
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
      // Light it with your lighter or a match (in your other hand), or at a burning campfire.
      const starter = fireStarter();
      if (starter) prompt = lightTorchFrom(starter);
      else prompt = 'Light it at a burning campfire, or with a lighter or matches';
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
      prompt = 'Hold it at a campfire to light it · keep it on you to light torches';
    } else if (!fire && held === 'matches') {
      prompt = `${inventory.count('matches')} matches · hold them at a campfire to light it · each lights a fire or a torch`;
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
      } else if (survival.thirst >= FULL) {
        prompt = `Water flask ${flask.water}/${holds} · you're not thirsty`;
      } else {
        prompt = `Water flask ${flask.water}/${holds} · click to drink`;
        if (input.startedUsingTool()) {
          flask.water -= 1;
          player.sip();
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
        prompt = 'No arrows · craft them from sticks and stone (Tab)';
      } else if (input.usingTool() && bowReady === 0 && !player.swimming) {
        drawingNow = true;
        if (drawing === 0) sfx('bow-draw');
        drawing = Math.min(BOW_DRAW_TIME, drawing + dt);
        const draw = drawing / BOW_DRAW_TIME;
        player.facing = Math.atan2(target.x - x, target.z - z);
        const { range } = arrowFlight(draw);
        const away = Math.hypot(target.x - x, target.z - z);
        progress = draw;
        busy = 'draw';
        player.drawAmount = draw;
        prompt = draw < BOW_MIN_DRAW ? 'Drawing…' : `${draw >= 1 ? 'Fully drawn' : 'Drawing…'} · flies true to ${Math.round(range)} m${away > range ? ' (it will drop short)' : ''} · let go to shoot`;
      } else if (drawing > 0) {
        // Let go: loose the arrow (unless the bow was barely drawn).
        const draw = drawing / BOW_DRAW_TIME;
        if (draw >= BOW_MIN_DRAW) {
          bowReady = BOW_COOLDOWN;
          inventory.remove('arrow', 1);
          arrows.fire(launchPoint(), target, draw);
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
    } else if (!fire && held === 'axe') {
      prompt = axeTarget ? `Click to swing at the ${axeTarget.kind}` : 'Axe · click to swing it · hold at a tree to chop';
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
    } else if (!fire && FOOD[held]) {
      // Food: click and hold to eat it (unless you're full).
      const ready = {
        cookedMeat: 'Click and hold to eat',
        burntMeat: 'Click and hold to eat (charred: not much in it)',
        rawMeat: 'Cook it on a spit over a campfire · hold the mouse button to eat it raw (risky)',
        berries: `Click and hold to eat (+${BERRY_HUNGER} hunger)`,
      }[held];
      if (survival.hunger >= FULL) prompt = held === 'rawMeat' ? "You're full · cook it on a spit over a campfire" : "You're full";
      else {
        const done = holdToUse(EAT_TIME);
        prompt = usingNow ? 'Eating…' : ready;
        if (usingNow) busy = 'eat';
        if (done) eat(held);
      }
    }

    // The axe: click or hold to swing it, whenever it isn't biting into a tree. An animal
    // right in front of you takes the blow.
    if (held === 'axe' && !chopping && !clickUsed && (input.usingTool() || input.startedUsingTool()) && axeReady === 0 && !player.airborne && !player.swimming) {
      axeReady = AXE_COOLDOWN;
      player.swingAxe();
      if (axeTarget) {
        sfx('arrow-hit', axeTarget.position);
        if (hitAnimal(axeTarget, 'axe')) {
          animals.kill(axeTarget);
          hud.toast(`You killed a ${axeTarget.kind}! Butcher it with your knife (hold E)`);
        } else hud.toast(`You hit the ${axeTarget.kind} with your axe`);
      } else sfx('swing');
    }

    // Stone knife (#75): click or hold to stab whatever's right in front of you. Only stabs
    // that land wear it down. Works next to a carcass or bush too.
    if (held === 'knife' && !clickUsed && !sapling && (input.usingTool() || input.startedUsingTool()) && knifeReady === 0 && !player.swimming && !player.airborne) {
      knifeReady = KNIFE_COOLDOWN;
      player.stab();
      sfx('stab');
      const target = offGround ? null : knifeHitTest(x, z, player.facing, animals.all);
      if (target) {
        const knife = inventory.slots[inventory.selected];
        if (hitAnimal(target, 'knife')) {
          animals.kill(target);
          hud.toast(`You killed a ${target.kind}! Butcher it with your knife (hold E)`);
        } else hud.toast(`You stab the ${target.kind}`);
        knife.durability -= 1;
        if (knife.durability <= 0) {
          inventory.slots[inventory.selected] = null;
          hud.toast('Your knife broke');
        }
      }
    }

    if (!ghostShown) placementGhost.hide();
    if (!searchingNow) searching = 0;
    if (!usingNow) using = 0;
    if (!drawingNow) drawing = 0;
    if (!butcheringNow) butchering = 0;
    // The axe bites once per swing, partway through it.
    const swinging = chopping || bucking;
    const beat = chopBeat;
    chopBeat = swinging ? (chopBeat + dt) % CHOP_BEAT : 0;
    if (swinging && beat < CHOP_BEAT * 0.45 && chopBeat >= CHOP_BEAT * 0.45) sfx('chop', chopping ? tree.spot : down.at);
    if (chopping && world.trees.chop(tree, dt, x, z)) {
      // It creaks, then crashes down (see Trees: FALL_TIME), and lies there to be cut up.
      const at = { x: tree.spot.x, z: tree.spot.z };
      sfx('tree-creak', at);
      setTimeout(() => sfx('tree-fall', at), 1050); // (tree-fall.mp3's crash is 0.25 s in: it lands with the tree, at FALL_TIME)
      hud.toast('Timber! Now cut it up into logs');
    }
    if (bucking) {
      // Each piece cut off leaves a log and sticks on the ground beside the trunk, on your side.
      const piece = world.trees.buck(down.tree, dt);
      if (piece) {
        const side = Math.atan2(x - down.at.x, z - down.at.z);
        Object.entries(piece).forEach(([item, count], k) => {
          const a = side + (k - 0.5) * 0.9;
          if (!pickups.drop(item, count, down.at.x + Math.sin(a) * 0.7, down.at.z + Math.cos(a) * 0.7)) give(item, count);
        });
        if (down.tree.state === 'vanishing') hud.toast("That's the last of it");
      }
    }
    // Cutting sticks from a young tree with the knife: a stroke every so often, and the sticks
    // straight into your hands.
    const cutBefore = cutBeat;
    cutBeat = cuttingSticks ? (cutBeat + dt) % 0.5 : 0;
    if (cuttingSticks && cutBefore > cutBeat) {
      player.stab();
      sfx('chop', sapling.spot);
    }
    if (cuttingSticks) {
      const got = world.trees.cutSticks(sapling, dt);
      if (got) give('stick', got);
    }
    // (With a flask in hand, the flask's prompt already says how to drink here.)
    if (canDrink && !(held === 'flask' && !drinking)) prompt = drinking ? 'Drinking…' : thirsty ? 'Hold E to drink' : "You're not thirsty";

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
    const inHand = inventory.selectedItem;
    player.setAction(inHand, swinging, drinking, inventory.hasBackpack, busy);
    player.busyWith = busyWith;
    player.busyProgress = busyProgress;
    player.chopPhase = swinging ? chopBeat / CHOP_BEAT : 0;
    const warmFire = offGround ? null : campfires.near(x, z, WARMTH_REACH);
    const nearFire = Boolean(warmFire && campfires.isBurning(warmFire));
    const wet = !player.cave && world.terrain.waterDepth(x, z) > WET_DEPTH;
    const cold = player.cave ? 0 : world.terrain.coldAt(x, z); // up the mountains (not down a cave)
    return {
      drinking, working: swinging || cuttingSticks, fire: nearFire, shelter: Boolean(shelter), wet, cold, outfit: inventory.outfit, prompt, progress,
      container: container?.searched && container.contents?.length ? container : null, // (shown in the menu: see main.js)
      // (What the player's busy with, for the sounds.)
      eating: busy === 'eat', searching: searchingNow, bandaging: busy === 'bandage',
    };
  };
}
