import { canCraft, GROUPS, isKnown, RECIPES } from './crafting.js';
import { BACKPACK_SIZE, HOTBAR_SIZE, ITEMS } from './inventory.js';
import { showItemIcon } from './itemIcons.js';
import { isNight } from './daylight.js';
import { formatDuration } from './survival.js';

const WARNING = 35; // a stat turns yellow below this...
const DANGER = 15; // ...and red, pulsing, below this
const DRAG_START = 6; // pixels the mouse moves before a press on a slot becomes a drag

// The thermometer's colour at temperature `value` (0–100).
const COOL = [79, 163, 255]; // freezing
const MILD = [255, 255, 255];
const WARM = [255, 84, 48]; // as warm as you get
function temperatureColor(value) {
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))));
  const rgb = value < 50 ? mix(COOL, MILD, (value - 15) / 35) : mix(MILD, WARM, (value - 50) / 50);
  return `rgb(${rgb.join(', ')})`;
}

// Game buttons never take keyboard focus. Otherwise, after clicking one, keys like Tab and
// Space would act on the button (e.g. Space would "click" a hotbar slot again).
function unfocusable(button) {
  button.tabIndex = -1;
  button.addEventListener('mousedown', (e) => e.preventDefault());
  return button;
}

// Shows the survival stats, clock, prompts and game-over screen.
export class Hud {
  constructor({ onRestart, onSlotClick, onSlotDrop, onDropItem, onUnequip, onWear, onCraft, onTakeNearby, onFeedFire, onTakeSpit, onTakeFromContainer }) {
    this.clock = document.getElementById('clock');
    this.prompt = document.getElementById('prompt');
    this.progress = document.getElementById('progress');
    this.stamina = document.getElementById('stamina');
    this.staminaFull = 0; // seconds it's been full (the bar fades away once it has been a moment)
    this.crosshair = document.getElementById('crosshair');
    this.toasts = document.getElementById('toasts');
    this.gameOver = document.getElementById('game-over');
    this.survived = document.getElementById('survived');
    this.bars = {
      health: document.getElementById('stat-health'),
      hunger: document.getElementById('stat-hunger'),
      thirst: document.getElementById('stat-thirst'),
      temperature: document.getElementById('stat-temperature'),
    };
    this.wet = document.getElementById('cond-wet');
    this.freezing = document.getElementById('cond-freezing');
    unfocusable(document.getElementById('restart')).addEventListener('click', onRestart);

    // The pause menu with the controls. It's open when the game starts.
    this.menu = document.getElementById('menu');
    this.resume = unfocusable(document.getElementById('resume'));
    this.resume.addEventListener('click', () => this.toggleMenu());

    // The menu with your character, inventory and crafting.
    this.inventory = document.getElementById('inventory');
    this.stashHotbar = document.getElementById('stash-hotbar');
    this.noBackpack = document.getElementById('no-backpack');
    this.equippedBackpack = document.querySelector('#equip-backpack .icon');
    this.equippedOutfit = document.querySelector('#equip-outfit .icon');
    showItemIcon(this.equippedOutfit, 'shirt');
    this.shownOutfit = null;
    // Drag what you're wearing off the menu to leave it on the ground, or the outfit onto an
    // empty slot to take it off and carry it.
    for (const [kind, icon] of [['outfit', this.equippedOutfit], ['backpack', this.equippedBackpack]]) {
      const box = icon.closest('.equip');
      box.addEventListener('pointerdown', (e) =>
        this.startDrag(e, box, (to) => onUnequip(kind, to), () => onUnequip(kind, null)),
      );
    }

    // Hotbar slots (numbered 1–6) at the bottom, then the backpack's slots in the menu.
    this.hotbar = document.getElementById('hotbar');
    this.backpack = document.getElementById('backpack');
    const backpackGrid = this.backpack.querySelector('.grid');
    this.slots = Array.from({ length: HOTBAR_SIZE + BACKPACK_SIZE }, (_, i) => {
      const inHotbar = i < HOTBAR_SIZE;
      const slot = unfocusable(document.createElement('button'));
      slot.className = 'slot';
      slot.innerHTML = `<span class="key">${inHotbar ? i + 1 : ''}</span><span class="icon"></span><span class="count"></span>`;
      slot.dataset.index = i;
      slot.addEventListener('click', () => {
        if (this.justDragged) this.justDragged = false;
        else onSlotClick(i);
      });
      slot.addEventListener('pointerdown', (e) => this.startDrag(e, slot, (to) => onSlotDrop(i, to), () => onDropItem(i), () => onWear(i), (spot) => onFeedFire(i, spot)));
      (inHotbar ? this.hotbar : backpackGrid).append(slot);
      return slot;
    });

    // What's on the ground within reach, while the menu's open (see showNearby).
    this.nearby = document.getElementById('nearby');
    this.nearbyGrid = this.nearby.querySelector('.grid');
    this.nearbyShown = '';
    this.onTakeNearby = onTakeNearby;
    // A container you've searched (a suitcase, a cupboard...), at the top of the Nearby box.
    this.containerBox = document.getElementById('nearby-container');
    this.containerGrid = this.containerBox.querySelector('.grid');
    this.containerShown = '';
    this.onTakeFromContainer = onTakeFromContainer;
    const takeAll = unfocusable(this.containerBox.querySelector('.take-all'));
    takeAll.addEventListener('click', () => onTakeFromContainer(null, null));
    // A campfire within reach, at the top of the Nearby box (see showNearbyFire).
    this.fireBox = document.getElementById('nearby-fire');
    this.fireSpit = this.fireBox.querySelector('.fire-spit');
    this.fireShown = '';
    this.onTakeSpit = onTakeSpit;
    for (const spot of this.fireBox.querySelectorAll('.fire-spot')) {
      unfocusable(spot);
      showItemIcon(spot.querySelector('.icon'), spot.dataset.spot);
      // (A click adds one, from wherever you have one.)
      spot.addEventListener('click', () => onFeedFire(null, spot.dataset.spot));
    }

    this.crafting = document.getElementById('crafting');
    const list = this.crafting.querySelector('.recipes');
    // One fold-out section per group (see GROUPS): click its heading to show its recipes.
    this.groups = GROUPS.map(({ id, name }) => {
      const section = document.createElement('details');
      section.className = 'recipe-group';
      section.innerHTML = `<summary><span class="name">${name}</span><span class="ready"></span></summary><div class="group-recipes"></div>`;
      unfocusable(section.querySelector('summary'));
      list.append(section);
      return { id, section, body: section.querySelector('.group-recipes'), ready: section.querySelector('.ready') };
    });
    this.recipes = RECIPES.map((recipe) => {
      const name = recipe.name ?? ITEMS[recipe.item].name;
      const button = unfocusable(document.createElement('button'));
      button.className = 'recipe';
      button.innerHTML = `<span class="icon"></span>
        <span><strong>${name}</strong><small>${recipe.description}</small></span>
        <span class="cost"></span>`;
      // One "have/need ingredient" line per ingredient: red until you have enough, then green.
      const costs = Object.entries(recipe.cost).map(([item, need]) => {
        const line = document.createElement('span');
        button.querySelector('.cost').append(line);
        return { item, need, line, label: ITEMS[item].name.toLowerCase() };
      });
      showItemIcon(button.querySelector('.icon'), recipe.item);
      button.addEventListener('click', () => onCraft(recipe));
      const group = this.groups.find((g) => g.id === recipe.group) ?? this.groups.at(-1);
      group.body.append(button);
      return { recipe, button, costs, group };
    });
    // Recipes the player already knows about, so each new one is announced just once.
    this.knownRecipes = new Set();
    this.unlocks = document.getElementById('unlocks');
    unfocusable(this.crafting.querySelector('.close')).addEventListener('click', () => this.toggleInventory());
  }

  get menuOpen() {
    return !this.menu.hidden;
  }

  toggleMenu() {
    if (this.loading && !this.menu.hidden) return; // (the menu stays up until everything's loaded)
    this.menu.hidden = !this.menu.hidden;
    this.resume.textContent = 'Resume';
  }

  // While the models load, Play waits (see main.js).
  setLoading(loading) {
    this.loading = loading;
    this.resume.disabled = loading;
    this.resume.textContent = loading ? 'Loading…' : 'Play';
  }

  // Esc closes the inventory first; otherwise it opens or closes the pause menu.
  escape() {
    if (this.inventoryOpen) this.toggleInventory();
    else this.toggleMenu();
  }

  get inventoryOpen() {
    return !this.inventory.hidden;
  }

  toggleInventory() {
    this.inventory.hidden = !this.inventory.hidden;
    document.body.classList.toggle('inventory-open', this.inventoryOpen);
    // The hotbar sits in the menu while it's open.
    (this.inventoryOpen ? this.stashHotbar : document.body).append(this.hotbar);
  }

  // Shows the piles on the ground beside you (`piles`, nearest first) in the menu's Nearby box,
  // one slot each: drag one onto a slot to take it there, or click to take all that fits.
  showNearby(piles) {
    const key = piles.map((p) => `${p.item}:${p.count}`).join(',');
    this.nearby.querySelector('#nearby-empty').hidden = piles.length > 0;
    this.nearby.querySelector('#nearby-tip').hidden = piles.length === 0;
    if (key === this.nearbyShown && piles.every((p, i) => this.nearbyPiles?.[i] === p)) return;
    this.nearbyShown = key;
    this.nearbyPiles = piles;
    this.nearbyGrid.replaceChildren(...piles.map((pile) => {
      const slot = unfocusable(document.createElement('button'));
      slot.className = 'slot near';
      slot.title = `${ITEMS[pile.item].name} · click to take, or drag onto a slot`;
      slot.innerHTML = '<span class="key"></span><span class="icon"></span><span class="count"></span>';
      showItemIcon(slot.querySelector('.icon'), pile.item);
      slot.querySelector('.count').textContent = pile.count > 1 ? pile.count : '';
      slot.addEventListener('click', () => {
        if (this.justDragged) this.justDragged = false;
        else this.onTakeNearby(pile, null);
      });
      slot.addEventListener('pointerdown', (e) => this.startDrag(e, slot, (to) => this.onTakeNearby(pile, to), () => {}));
      return slot;
    }));
  }

  // The stamina bar over the hotbar (`stamina` 0-1): shown while it's being used or coming back,
  // amber while you're winded, and fading away a moment after it's full again.
  updateStamina(dt, stamina, winded) {
    this.staminaFull = stamina >= 1 ? this.staminaFull + dt : 0;
    this.stamina.classList.toggle('shown', this.staminaFull < 1 && !this.inventoryOpen);
    this.stamina.classList.toggle('winded', winded);
    this.stamina.firstElementChild.style.width = `${stamina * 100}%`;
  }

  // The crosshair, a small dot in the middle of the view: `shown` while you've a bow in hand to aim
  // with (and the mouse is captured, so shots go there), brighter while you're drawing it.
  showCrosshair(shown, drawing) {
    this.crosshair.classList.toggle('shown', shown && !this.inventoryOpen);
    this.crosshair.classList.toggle('drawing', drawing);
  }

  // Shows a container you've searched (or none: null) at the top of the Nearby box, its name
  // (`label`) and what's still in it (`contents`: { item, count } each): drag a thing onto a slot
  // to take it there, or click it to take it all; Take all empties it.
  showContainer(container) {
    this.containerBox.hidden = !container;
    if (!container) {
      this.containerShown = '';
      return;
    }
    const key = `${container.label}|${container.contents.map((c) => `${c.item}:${c.count}`).join(',')}`;
    if (key === this.containerShown) return;
    this.containerShown = key;
    this.containerBox.querySelector('.container-label').textContent = `${container.label[0].toUpperCase()}${container.label.slice(1)}`;
    this.containerGrid.replaceChildren(...container.contents.map((thing, k) => {
      const slot = unfocusable(document.createElement('button'));
      slot.className = 'slot near';
      slot.title = `${ITEMS[thing.item].name} · click to take, or drag onto a slot`;
      slot.innerHTML = '<span class="key"></span><span class="icon"></span><span class="count"></span>';
      showItemIcon(slot.querySelector('.icon'), thing.item);
      slot.querySelector('.count').textContent = thing.count > 1 ? thing.count : '';
      slot.addEventListener('click', () => {
        if (this.justDragged) this.justDragged = false;
        else this.onTakeFromContainer(k, null);
      });
      slot.addEventListener('pointerdown', (e) => this.startDrag(e, slot, (to) => this.onTakeFromContainer(k, to), () => {}));
      return slot;
    }));
  }

  // Shows the campfire beside you (or none: `fire` null) at the top of the Nearby box: how it's
  // burning (`status`), spots to drag sticks and logs onto, and the spit's places (`spit`: for
  // each, the meat on it, { item, cooked }, or null; or no spit at all), each piece of meat a
  // slot to drag into your inventory or click to take, and the empty places a spot for raw meat.
  showNearbyFire(fire) {
    this.fireBox.hidden = !fire;
    // (The menu moves up to make room: it and the Nearby box under it, centred together.)
    const below = this.nearby.offsetHeight + 12;
    if (below !== this.nearbyBelow) {
      this.nearbyBelow = below;
      this.nearby.parentElement.style.setProperty('--below', `${below}px`);
    }
    if (!fire) {
      this.fireShown = '';
      return;
    }
    this.fireBox.querySelector('.fire-status').textContent = fire.status;
    const key = JSON.stringify(fire.spit?.map((piece) => piece?.item ?? null) ?? null);
    if (key === this.fireShown) return;
    this.fireShown = key;
    this.fireSpit.hidden = !fire.spit;
    this.fireSpit.replaceChildren(...(fire.spit ?? []).map((piece, place) => {
      const slot = unfocusable(document.createElement('button'));
      slot.innerHTML = '<span class="key"></span><span class="icon"></span><span class="count"></span>';
      if (!piece) {
        // An empty place on the skewer: drop raw meat here to put it on.
        slot.className = 'slot fire-spot spit-place';
        slot.dataset.spot = `spit-${place}`;
        slot.title = 'Drag raw meat here to put it on the spit';
        return slot;
      }
      slot.className = 'slot near spit-piece';
      slot.title = `${ITEMS[piece.item].name} on the spit · click to take it, or drag onto a slot`;
      showItemIcon(slot.querySelector('.icon'), piece.item);
      slot.addEventListener('click', () => {
        if (this.justDragged) this.justDragged = false;
        else this.onTakeSpit(place, null);
      });
      slot.addEventListener('pointerdown', (e) => this.startDrag(e, slot, (to) => this.onTakeSpit(place, to), () => {}));
      return slot;
    }));
  }

  update(survival, inventory, { prompt, progress }) {
    // In each group, craftable recipes first, then the rest, each in RECIPES order (#70). A
    // group shows once you know one of its recipes, with how many you can make now.
    for (const group of this.groups) {
      const mine = this.recipes.filter((r) => r.group === group);
      const sorted = [...mine].sort((a, b) => canCraft(inventory, b.recipe) - canCraft(inventory, a.recipe) || mine.indexOf(a) - mine.indexOf(b));
      if (sorted.some((r, i) => group.body.children[i] !== r.button)) group.body.append(...sorted.map((r) => r.button));
      const known = mine.filter((r) => isKnown(inventory, r.recipe));
      group.section.hidden = known.length === 0;
      const ready = known.filter((r) => canCraft(inventory, r.recipe)).length;
      const text = ready ? `${ready} ready` : '';
      if (group.ready.textContent !== text) group.ready.textContent = text;
    }
    for (const { recipe, button, costs } of this.recipes) {
      const known = isKnown(inventory, recipe);
      button.hidden = !known;
      button.disabled = !canCraft(inventory, recipe);
      for (const { item, need, line, label } of costs) {
        const have = inventory.count(item);
        const text = `${have}/${need} ${label}`;
        if (line.textContent !== text) line.textContent = text;
        line.className = have >= need ? 'enough' : 'missing';
      }
      if (known && !this.knownRecipes.has(recipe)) {
        this.knownRecipes.add(recipe);
        this.announceRecipe(recipe);
      }
    }
    this.backpack.hidden = !inventory.hasBackpack;
    this.noBackpack.hidden = inventory.hasBackpack;
    showItemIcon(this.equippedBackpack, inventory.hasBackpack ? 'backpack' : null);
    if (this.shownOutfit !== inventory.outfit) {
      this.shownOutfit = inventory.outfit;
      showItemIcon(this.equippedOutfit, inventory.outfit ?? 'shirt');
    }

    this.slots.forEach((slot, i) => {
      const contents = inventory.slots[i];
      slot.classList.toggle('selected', i === inventory.selected);
      slot.title = contents ? ITEMS[contents.item].name : '';
      showItemIcon(slot.querySelector('.icon'), contents?.item ?? null);
      // A flask shows how many drinks it holds, a lit torch how long it has left; other stacks
      // show how many there are.
      const item = contents && ITEMS[contents.item];
      const count = !contents ? ''
        : item.holds ? `${contents.water}/${item.holds}`
        : item.burns ? (contents.burn >= 60 ? `${Math.ceil(contents.burn / 60)}h` : `${Math.ceil(contents.burn)}m`)
        : contents.count > 1 ? contents.count : '';
      slot.querySelector('.count').textContent = count;
    });

    this.progress.hidden = progress == null;
    if (progress != null) this.progress.firstElementChild.style.width = `${progress * 100}%`;

    for (const [name, stat] of Object.entries(this.bars)) {
      const value = survival[name];
      stat.querySelector('.level').style.clipPath = `inset(${100 - value}% 0 0 0)`;
      if (name === 'temperature') {
        // The thermometer shows how warm you are: cool blue when freezing, white in between,
        // warm red at its hottest (pulsing while you're freezing).
        stat.style.color = temperatureColor(value);
        stat.classList.toggle('freezing', survival.isFreezing);
        continue;
      }
      stat.classList.toggle('warning', value < WARNING && value >= DANGER);
      stat.classList.toggle('danger', value < DANGER);
    }

    this.wet.hidden = !survival.isWet;
    this.freezing.hidden = !survival.isFreezing;

    const { day, hour, minute } = survival.clock;
    // (The icon for the weather too: see src/weather.js and `weather` in main.js.)
    const kind = this.weather ?? 'overcast';
    const icon = kind === 'blizzard' ? '🌨️' : isNight(survival.hourOfDay) ? '🌙' : { clear: '☀️', fewClouds: '🌤️', overcast: '☁️' }[kind];
    this.clock.textContent = `${icon} Day ${day} · ${pad(hour)}:${pad(minute)}`;
    this.clock.title = this.weatherName ?? '';

    this.prompt.hidden = !prompt;
    if (prompt) this.prompt.textContent = prompt;

    if (!survival.alive && this.gameOver.hidden) {
      this.survived.textContent = `You survived ${formatDuration(survival.minutesSurvived)}.`;
      this.gameOver.hidden = false;
    }
  }

  // Follows the mouse after a press on a slot. Letting go on another slot moves the item
  // there; letting go off the menu and hotbar drops it on the ground.
  // Drags the item shown in `slot` (a slot or an equipment box): dropped onto a slot, calls
  // onto(thatSlotsIndex); onto your character or Outfit box, wear(); off the menu, outside().
  startDrag(down, slot, onto, outside, wear = null, toFire = null) {
    if (down.button !== 0) return;
    const item = slot.querySelector('.icon').dataset.item;
    if (!item || item === 'shirt') return; // (the shirt stays on)
    const ghost = document.getElementById('drag-item');
    let dragging = false;

    const move = (e) => {
      if (!dragging && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < DRAG_START) return;
      if (!dragging) {
        dragging = true;
        showItemIcon(ghost.querySelector('.icon'), item);
        ghost.querySelector('.count').textContent = slot.querySelector('.count')?.textContent ?? '';
        ghost.hidden = false;
        slot.classList.add('dragging');
      }
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!dragging) return;
      ghost.hidden = true;
      slot.classList.remove('dragging');
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const ontoFire = target?.closest('.fire-spot');
      const ontoSlot = target?.closest('.slot:not(.near):not(.fire-spot)');
      // The browser may still send a click to the slot where the drag started.
      this.justDragged = ontoSlot === slot || target?.closest('.slot') === slot;
      if (ontoFire) toFire?.(ontoFire.dataset.spot);
      else if (target?.closest('#nearby-fire')) return; // (dropped by the fire but not on a spot: nothing)
      else if (ontoSlot) onto(Number(ontoSlot.dataset.index));
      else if (target?.closest('#nearby')) outside(); // (into Nearby: put it on the ground)
      else if (wear && target?.closest('#equip-outfit, #character-view')) wear();
      else if (!target?.closest('#inventory, #hotbar')) outside();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // A short message that floats up and fades, like "+4 Wood".
  // (`ms`: how long it stays up, for longer news.)
  toast(text, ms = 1600) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toast.style.animationDuration = `${ms}ms`;
    this.toasts.append(toast);
    setTimeout(() => toast.remove(), ms);
  }

  // A card at the top of the screen saying a new recipe can be crafted. Several at once (like
  // the half dozen that open up when you butcher your first animal) share two cards: the first
  // recipe, and the rest named on one, so they don't stack down the middle of the screen.
  announceRecipe(recipe) {
    this.newRecipes = [...(this.newRecipes ?? []), recipe];
    if (this.newRecipes.length > 1) return;
    setTimeout(() => {
      const [first, ...rest] = this.newRecipes;
      this.newRecipes = [];
      const name = (r) => r.name ?? ITEMS[r.item].name;
      this.showUnlock(first.item, 'New recipe', name(first));
      if (rest.length) {
        const named = rest.slice(0, 3).map(name).join(', ');
        const text = rest.length > 3 ? `${named} and ${rest.length - 3} more` : named;
        this.showUnlock(rest[0].item, `+${rest.length} more new recipe${rest.length > 1 ? 's' : ''}`, text);
      }
    }, 0);
  }

  showUnlock(item, title, text) {
    const card = document.createElement('div');
    card.className = 'unlock';
    card.innerHTML = `<span class="icon"></span>
      <span><small>${title}</small><strong>${text}</strong><em>Press Tab to craft</em></span>`;
    showItemIcon(card.querySelector('.icon'), item);
    this.unlocks.append(card);
    setTimeout(() => card.remove(), 5000);
  }

  // Forgets which recipes have been announced, for a new game.
  forgetRecipes() {
    this.knownRecipes.clear();
    this.newRecipes = [];
    this.unlocks.replaceChildren();
  }

  // Fades to black and back, showing what time you woke up.
  // The compass strip at the top of the screen (#94), shown while you carry a compass.
  // `heading` is which way you face and `crash` which way the crash is, both in degrees
  // clockwise from north; `crashDistance` is in meters.
  updateCompass(show, heading, crash, crashDistance) {
    if (!this.compass) {
      this.compass = document.getElementById('compass');
      const strip = this.compass.querySelector('.strip');
      this.compassMarks = [];
      const add = (bearing, text, className) => {
        const mark = document.createElement('div');
        mark.className = `mark ${className}`;
        mark.textContent = text;
        strip.append(mark);
        this.compassMarks.push({ bearing, mark });
        return mark;
      };
      const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      for (let b = 0; b < 360; b += 15) {
        if (b % 45 === 0) add(b, names[b / 45], b === 0 ? 'north' : b % 90 ? 'minor' : '');
        else add(b, '', 'tick');
      }
      this.crashMark = add(0, '', 'crash');
    }
    this.compass.hidden = !show;
    if (!show) return;
    this.compassMarks[this.compassMarks.length - 1].bearing = crash;
    this.crashMark.textContent = `Crash ${formatDistance(crashDistance)}`;
    for (const { bearing, mark } of this.compassMarks) {
      // How far round from where you're facing, -180 to 180 degrees. The strip shows ±90.
      const off = ((((bearing - heading) % 360) + 540) % 360) - 180;
      mark.hidden = Math.abs(off) > 90;
      mark.style.left = `${50 + (off / 180) * 100}%`;
    }
  }

  // A speech bubble over the player's head, for `seconds`. Call placeSpeech() every frame.
  say(text, seconds = 5) {
    const speech = document.getElementById('speech');
    speech.textContent = text;
    speech.hidden = false;
    clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => (speech.hidden = true), seconds * 1000);
  }

  // Moves the speech bubble to (x, y) on screen: the point just above the player's head.
  placeSpeech(x, y) {
    const speech = document.getElementById('speech');
    if (speech.hidden) return;
    speech.style.left = `${x}px`;
    speech.style.top = `${y}px`;
  }

  // A brief red flash round the edges of the screen when you're hurt.
  flashHurt() {
    const flash = document.getElementById('hurt');
    flash.hidden = false;
    flash.style.animation = 'none';
    void flash.offsetWidth; // (restarts the animation)
    flash.style.animation = '';
  }

  hideSpeech() {
    clearTimeout(this.speechTimer);
    document.getElementById('speech').hidden = true;
  }

  showSleep(wakeText) {
    const sleep = document.getElementById('sleep');
    sleep.querySelector('strong').textContent = wakeText;
    sleep.hidden = false;
    // Restart the fade, in case it's still running.
    sleep.style.animation = 'none';
    void sleep.offsetWidth;
    sleep.style.animation = '';
    clearTimeout(this.sleepTimer);
    this.sleepTimer = setTimeout(() => (sleep.hidden = true), 3000);
  }

  hideGameOver() {
    this.gameOver.hidden = true;
  }
}

const pad = (n) => String(n).padStart(2, '0');

// 340 m, or 1.2 km.
function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
