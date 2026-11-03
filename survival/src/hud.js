import { canCraft, isKnown, RECIPES } from './crafting.js';
import { BACKPACK_SIZE, HOTBAR_SIZE, ITEMS } from './inventory.js';
import { itemIconUrl, showItemIcon } from './itemIcons.js';
import { isNight } from './daylight.js';
import { formatDuration } from './survival.js';

const WARNING = 35; // a stat turns yellow below this...
const DANGER = 15; // ...and red, pulsing, below this
const DRAG_START = 6; // pixels the mouse moves before a press on a slot becomes a drag

// Game buttons never take keyboard focus. Otherwise, after clicking one, keys like Tab and
// Space would act on the button (e.g. Space would "click" a hotbar slot again).
function unfocusable(button) {
  button.tabIndex = -1;
  button.addEventListener('mousedown', (e) => e.preventDefault());
  return button;
}

// Shows the survival stats, clock, prompts and game-over screen.
export class Hud {
  constructor({ onRestart, onSlotClick, onSlotDrop, onDropItem, onCraft }) {
    this.clock = document.getElementById('clock');
    this.prompt = document.getElementById('prompt');
    this.progress = document.getElementById('progress');
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
    showItemIcon(document.querySelector('#equip-outfit .icon'), 'outfit');

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
      slot.addEventListener('pointerdown', (e) => this.startDrag(e, slot, i, onSlotDrop, onDropItem));
      (inHotbar ? this.hotbar : backpackGrid).append(slot);
      return slot;
    });

    this.crafting = document.getElementById('crafting');
    const list = this.crafting.querySelector('.recipes');
    this.recipes = RECIPES.map((recipe) => {
      const name = recipe.name ?? ITEMS[recipe.item].name;
      const button = unfocusable(document.createElement('button'));
      button.className = 'recipe';
      button.innerHTML = `<span class="icon" style="background-image: url(${itemIconUrl(recipe.item)})"></span>
        <span><strong>${name}</strong><small>${recipe.description}</small></span>
        <span class="cost"></span>`;
      // One "have/need ingredient" line per ingredient: red until you have enough, then green.
      const costs = Object.entries(recipe.cost).map(([item, need]) => {
        const line = document.createElement('span');
        button.querySelector('.cost').append(line);
        return { item, need, line, label: ITEMS[item].name.toLowerCase() };
      });
      button.addEventListener('click', () => onCraft(recipe));
      list.append(button);
      return { recipe, button, costs };
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
    this.menu.hidden = !this.menu.hidden;
    this.resume.textContent = 'Resume';
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

  update(survival, inventory, { prompt, progress }) {
    // Craftable recipes first, then the rest, each group in RECIPES order (#70).
    const list = this.crafting.querySelector('.recipes');
    const sorted = [...this.recipes].sort((a, b) => canCraft(inventory, b.recipe) - canCraft(inventory, a.recipe) || this.recipes.indexOf(a) - this.recipes.indexOf(b));
    if (sorted.some((r, i) => list.children[i] !== r.button)) list.append(...sorted.map((r) => r.button));
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

    this.slots.forEach((slot, i) => {
      const contents = inventory.slots[i];
      slot.classList.toggle('selected', i === inventory.selected);
      slot.title = contents ? ITEMS[contents.item].name : '';
      showItemIcon(slot.querySelector('.icon'), contents?.item ?? null);
      // A flask shows how many drinks it holds; other stacks show how many there are.
      const count = !contents ? '' : ITEMS[contents.item].holds ? `${contents.water}/${ITEMS[contents.item].holds}` : contents.count > 1 ? contents.count : '';
      slot.querySelector('.count').textContent = count;
    });

    this.progress.hidden = progress == null;
    if (progress != null) this.progress.firstElementChild.style.width = `${progress * 100}%`;

    for (const [name, stat] of Object.entries(this.bars)) {
      const value = survival[name];
      stat.querySelector('.level').style.clipPath = `inset(${100 - value}% 0 0 0)`;
      stat.classList.toggle('warning', value < WARNING && value >= DANGER);
      stat.classList.toggle('danger', value < DANGER);
    }

    this.wet.hidden = !survival.isWet;
    this.freezing.hidden = !survival.isFreezing;

    const { day, hour, minute } = survival.clock;
    const icon = isNight(survival.hourOfDay) ? '🌙' : '☀️';
    this.clock.textContent = `${icon} Day ${day} · ${pad(hour)}:${pad(minute)}`;

    this.prompt.hidden = !prompt;
    if (prompt) this.prompt.textContent = prompt;

    if (!survival.alive && this.gameOver.hidden) {
      this.survived.textContent = `You survived ${formatDuration(survival.minutesSurvived)}.`;
      this.gameOver.hidden = false;
    }
  }

  // Follows the mouse after a press on a slot. Letting go on another slot moves the item
  // there; letting go off the menu and hotbar drops it on the ground.
  startDrag(down, slot, index, onSlotDrop, onDropItem) {
    if (down.button !== 0) return;
    const item = slot.querySelector('.icon').dataset.item;
    if (!item) return;
    const ghost = document.getElementById('drag-item');
    let dragging = false;

    const move = (e) => {
      if (!dragging && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < DRAG_START) return;
      if (!dragging) {
        dragging = true;
        showItemIcon(ghost.querySelector('.icon'), item);
        ghost.querySelector('.count').textContent = slot.querySelector('.count').textContent;
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
      const onto = target?.closest('.slot');
      // The browser may still send a click to the slot where the drag started.
      this.justDragged = target?.closest('.slot') === slot;
      if (onto) onSlotDrop(index, Number(onto.dataset.index));
      else if (!target?.closest('#inventory, #hotbar')) onDropItem(index);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // A short message that floats up and fades, like "+4 Wood".
  toast(text) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    this.toasts.append(toast);
    setTimeout(() => toast.remove(), 1600);
  }

  // A card at the top of the screen saying a new recipe can be crafted.
  announceRecipe(recipe) {
    const card = document.createElement('div');
    card.className = 'unlock';
    card.innerHTML = `<span class="icon" style="background-image: url(${itemIconUrl(recipe.item)})"></span>
      <span><small>New recipe</small><strong>${recipe.name ?? ITEMS[recipe.item].name}</strong><em>Press Tab to craft</em></span>`;
    this.unlocks.append(card);
    setTimeout(() => card.remove(), 5000);
  }

  // Forgets which recipes have been announced, for a new game.
  forgetRecipes() {
    this.knownRecipes.clear();
    this.unlocks.replaceChildren();
  }

  // Fades to black and back, showing what time you woke up.
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
