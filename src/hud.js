import { formatDuration } from './survival.js';

const LOW = 25; // bars flash below this

// Shows the survival stats, clock, prompts and game-over screen.
export class Hud {
  constructor({ onRestart }) {
    this.clock = document.getElementById('clock');
    this.prompt = document.getElementById('prompt');
    this.gameOver = document.getElementById('game-over');
    this.survived = document.getElementById('survived');
    this.bars = {
      health: document.querySelector('#stat-health .fill'),
      hunger: document.querySelector('#stat-hunger .fill'),
      thirst: document.querySelector('#stat-thirst .fill'),
    };
    document.getElementById('restart').addEventListener('click', onRestart);
  }

  update(survival, { prompt }) {
    for (const [name, fill] of Object.entries(this.bars)) {
      const value = survival[name];
      fill.style.width = `${value}%`;
      fill.parentElement.classList.toggle('low', value < LOW);
    }

    const { day, hour, minute } = survival.clock;
    this.clock.textContent = `Day ${day} · ${pad(hour)}:${pad(minute)}`;

    this.prompt.hidden = !prompt;
    if (prompt) this.prompt.textContent = prompt;

    if (!survival.alive && this.gameOver.hidden) {
      this.survived.textContent = `You survived ${formatDuration(survival.minutesSurvived)}.`;
      this.gameOver.hidden = false;
    }
  }

  hideGameOver() {
    this.gameOver.hidden = true;
  }
}

const pad = (n) => String(n).padStart(2, '0');
