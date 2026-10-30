// What the player is carrying: a hotbar of slots, plus a backpack with more slots.
// Each slot holds a stack of one kind of item. Slots 0–5 are the hotbar; the rest are the backpack.

export const ITEMS = {
  axe: { name: 'Axe', icon: '🪓', stack: 1 },
  wood: { name: 'Wood', icon: '🪵', stack: 50 },
  trap: { name: 'Trap', icon: '🪤', stack: 5 },
  campfire: { name: 'Campfire', icon: '🔥', stack: 3 },
  rawMeat: { name: 'Raw meat', icon: '🥩', stack: 10 },
  cookedMeat: { name: 'Cooked meat', icon: '🍖', stack: 10 },
  // Not kept in a slot: picking it up unlocks the backpack's slots.
  backpack: { name: 'Backpack', icon: '🎒', stack: 1 },
};

export const HOTBAR_SIZE = 6;
export const BACKPACK_SIZE = 12;

export class Inventory {
  constructor() {
    this.reset();
  }

  reset() {
    this.slots = Array.from({ length: HOTBAR_SIZE + BACKPACK_SIZE }, () => null); // { item, count } or null
    this.selected = 0;
    // You start with nothing: the axe and backpack are found at the crash site.
    this.hasBackpack = false;
  }

  // Slots you can currently put things in: just the hotbar until you find the backpack.
  get usableSlots() {
    return this.hasBackpack ? this.slots.length : HOTBAR_SIZE;
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

  // Moves the stack in slot `index` between the hotbar and the backpack, topping up
  // matching stacks first. Returns false if not all of it fit.
  move(index) {
    const moving = this.slots[index];
    if (!moving) return true;
    const [from, to] = index < HOTBAR_SIZE ? [HOTBAR_SIZE, this.slots.length] : [0, HOTBAR_SIZE];
    const { stack } = ITEMS[moving.item];
    for (let i = from; i < to && moving.count > 0; i++) {
      const slot = this.slots[i];
      if (slot?.item !== moving.item) continue;
      const added = Math.min(moving.count, stack - slot.count);
      slot.count += added;
      moving.count -= added;
    }
    for (let i = from; i < to && moving.count > 0; i++) {
      if (this.slots[i]) continue;
      this.slots[i] = { ...moving };
      moving.count = 0;
    }
    if (moving.count === 0) this.slots[index] = null;
    return moving.count === 0;
  }

  // Adds items, filling existing stacks first. Returns how many didn't fit.
  add(item, count) {
    const { stack } = ITEMS[item];
    for (const slot of this.slots.slice(0, this.usableSlots)) {
      if (count === 0) break;
      if (slot?.item !== item) continue;
      const added = Math.min(count, stack - slot.count);
      slot.count += added;
      count -= added;
    }
    for (let i = 0; i < this.usableSlots && count > 0; i++) {
      if (this.slots[i]) continue;
      const added = Math.min(count, stack);
      this.slots[i] = { item, count: added };
      count -= added;
    }
    return count;
  }
}
