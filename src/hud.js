import { canCraft, RECIPES } from './crafting.js';
import { HOTBAR_SIZE, ITEMS } from './inventory.js';
import { isNight } from './daylight.js';
import { formatDuration } from './survival.js';

const LOW = 25; // bars flash below this

// Shows the survival stats, clock, prompts and game-over screen.
export class Hud {
  constructor({ onRestart, onSelectSlot, onCraft }) {
    this.clock = document.getElementById('clock');
    this.prompt = document.getElementById('prompt');
    this.progress = document.getElementById('progress');
    this.toasts = document.getElementById('toasts');
    this.gameOver = document.getElementById('game-over');
    this.survived = document.getElementById('survived');
    this.bars = {
      health: document.querySelector('#stat-health .fill'),
      hunger: document.querySelector('#stat-hunger .fill'),
      thirst: document.querySelector('#stat-thirst .fill'),
    };
    document.getElementById('restart').addEventListener('click', onRestart);

    const hotbar = document.getElementById('hotbar');
    this.slots = Array.from({ length: HOTBAR_SIZE }, (_, i) => {
      const slot = document.createElement('button');
      slot.className = 'slot';
      slot.innerHTML = `<span class="key">${i + 1}</span><span class="icon"></span><span class="count"></span>`;
      slot.addEventListener('click', () => onSelectSlot(i));
      hotbar.append(slot);
      return slot;
    });

    this.crafting = document.getElementById('crafting');
    const list = this.crafting.querySelector('.recipes');
    this.recipes = RECIPES.map((recipe) => {
      const { name, icon } = ITEMS[recipe.item];
      const cost = Object.entries(recipe.cost)
        .map(([item, count]) => `${count} ${ITEMS[item].name.toLowerCase()}`)
        .join(', ');
      const button = document.createElement('button');
      button.className = 'recipe';
      button.innerHTML = `<span class="icon">${icon}</span>
        <span><strong>${name}</strong><small>${recipe.description}</small></span>
        <span class="cost">${cost}</span>`;
      button.addEventListener('click', () => onCraft(recipe));
      list.append(button);
      return { recipe, button };
    });
    this.crafting.querySelector('.close').addEventListener('click', () => this.toggleCrafting());
  }

  toggleCrafting() {
    this.crafting.hidden = !this.crafting.hidden;
  }

  update(survival, inventory, { prompt, progress }) {
    for (const { recipe, button } of this.recipes) button.disabled = !canCraft(inventory, recipe);

    this.slots.forEach((slot, i) => {
      const contents = inventory.slots[i];
      slot.classList.toggle('selected', i === inventory.selected);
      slot.title = contents ? ITEMS[contents.item].name : '';
      slot.querySelector('.icon').textContent = contents ? ITEMS[contents.item].icon : '';
      slot.querySelector('.count').textContent = contents && contents.count > 1 ? contents.count : '';
    });

    this.progress.hidden = progress == null;
    if (progress != null) this.progress.firstElementChild.style.width = `${progress * 100}%`;

    for (const [name, fill] of Object.entries(this.bars)) {
      const value = survival[name];
      fill.style.width = `${value}%`;
      fill.parentElement.classList.toggle('low', value < LOW);
    }

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

  // A short message that floats up and fades, like "+4 Wood".
  toast(text) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    this.toasts.append(toast);
    setTimeout(() => toast.remove(), 1600);
  }

  hideGameOver() {
    this.gameOver.hidden = true;
  }
}

const pad = (n) => String(n).padStart(2, '0');
