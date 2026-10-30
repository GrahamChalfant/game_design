// What the player is carrying: a hotbar of slots, each holding one kind of item.

export const ITEMS = {
  axe: { name: 'Axe', icon: '🪓', stack: 1 },
  wood: { name: 'Wood', icon: '🪵', stack: 50 },
};

export const HOTBAR_SIZE = 6;

export class Inventory {
  constructor() {
    this.reset();
  }

  reset() {
    this.slots = Array.from({ length: HOTBAR_SIZE }, () => null); // each is { item, count } or null
    this.selected = 0;
    this.add('axe', 1);
  }

  // The item in the selected slot ('axe', 'wood', ...), or null.
  get selectedItem() {
    return this.slots[this.selected]?.item ?? null;
  }

  select(index) {
    this.selected = index;
  }

  slotOf(item) {
    return this.slots.findIndex((slot) => slot?.item === item);
  }

  count(item) {
    return this.slots.reduce((total, slot) => total + (slot?.item === item ? slot.count : 0), 0);
  }

  // Adds items, filling existing stacks first. Returns how many didn't fit.
  add(item, count) {
    const { stack } = ITEMS[item];
    for (const slot of this.slots) {
      if (count === 0) break;
      if (slot?.item !== item) continue;
      const added = Math.min(count, stack - slot.count);
      slot.count += added;
      count -= added;
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (this.slots[i]) continue;
      const added = Math.min(count, stack);
      this.slots[i] = { item, count: added };
      count -= added;
    }
    return count;
  }
}
