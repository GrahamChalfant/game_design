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

  // Takes `count` items out, emptying slots that run out. Returns false (and takes nothing)
  // if there aren't enough.
  remove(item, count) {
    if (this.count(item) < count) return false;
    for (let i = this.slots.length - 1; i >= 0 && count > 0; i--) {
      const slot = this.slots[i];
      if (slot?.item !== item) continue;
      const taken = Math.min(count, slot.count);
      slot.count -= taken;
      count -= taken;
      if (slot.count === 0) this.slots[i] = null;
    }
    return true;
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
