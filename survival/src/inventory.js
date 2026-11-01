// What the player is carrying: a hotbar of slots, plus a backpack with more slots.
// Each item's icon is a small 3D model, drawn in itemIcons.js.
// Each slot holds a stack of one kind of item. Slots 0–5 are the hotbar; the rest are the backpack.

export const ITEMS = {
  axe: { name: 'Axe', stack: 1 },
  wood: { name: 'Wood', stack: 50 },
  trap: { name: 'Trap', stack: 5 },
  campfire: { name: 'Campfire', stack: 3 },
  shelter: { name: 'Shelter', stack: 1 },
  lighter: { name: 'Lighter', stack: 1 },
  flare: { name: 'Flare', stack: 3 },
  bandage: { name: 'Bandage', stack: 10 },
  rope: { name: 'Rope', stack: 10 },
  hide: { name: 'Hide', stack: 10 },
  gut: { name: 'Intestines', stack: 10 },
  // Holds up to `holds` drinks of water, kept on its slot as `water`.
  flask: { name: 'Water flask', stack: 1, holds: 3 },
  rawMeat: { name: 'Raw meat', stack: 10 },
  cookedMeat: { name: 'Cooked meat', stack: 10 },
  // Not kept in a slot: picking it up unlocks the backpack's slots.
  backpack: { name: 'Backpack', stack: 1 },
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
    this.found = new Set(); // every item picked up this game, even if it's since been used
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

  // Moves the stack in slot `from` onto slot `to`: it tops up a matching stack, swaps with a
  // different item, or fills an empty slot.
  transfer(from, to) {
    const moving = this.slots[from];
    const target = this.slots[to];
    if (!moving || from === to) return;
    if (target?.item === moving.item) {
      const added = Math.min(moving.count, ITEMS[moving.item].stack - target.count);
      target.count += added;
      moving.count -= added;
      if (moving.count === 0) this.slots[from] = null;
    } else {
      this.slots[to] = moving;
      this.slots[from] = target;
    }
  }

  // Adds items, filling existing stacks first. Returns how many didn't fit.
  add(item, count) {
    this.found.add(item);
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
      this.slots[i] = ITEMS[item].holds ? { item, count: added, water: 0 } : { item, count: added };
      count -= added;
    }
    return count;
  }
}
