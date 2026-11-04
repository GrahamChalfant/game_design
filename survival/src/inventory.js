import { BOW_DURABILITY, KNIFE_DURABILITY, STONE_STACK } from './hunting.js';
import { BERRY_STACK } from './foraging.js';

export const TORCH_MINUTES = 8 * 60; // a lit torch burns for 8 in-game hours (about 5 real minutes at night)

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
  stone: { name: 'Stone', stack: STONE_STACK },
  bowstring: { name: 'Bowstring', stack: 10 },
  // Wears out: shots left are kept on its slot as `durability`.
  bow: { name: 'Bow', stack: 1, durability: BOW_DURABILITY },
  arrow: { name: 'Arrow', stack: 30 },
  // Wears out: stabs that land are counted down on its slot as `durability`.
  knife: { name: 'Stone knife', stack: 1, durability: KNIFE_DURABILITY },
  berries: { name: 'Berries', stack: BERRY_STACK },
  rawMeat: { name: 'Raw meat', stack: 10 },
  cookedMeat: { name: 'Cooked meat', stack: 10 },
  // Made from wood; light it at a burning campfire (#94).
  torch: { name: 'Torch', stack: 1 },
  // Lights up the dark around you. Burns down only while you hold it: the in-game minutes
  // it has left are kept on its slot as `burn`.
  litTorch: { name: 'Lit torch', stack: 1, burns: TORCH_MINUTES },
  // Carry it to see which way you're facing, and which way the crash is (#94).
  compass: { name: 'Compass', stack: 1 },
  // Press M to look at it (#94). Sometimes found in the fire lookout tower's supply crate.
  map: { name: 'Map', stack: 1 },
  // Clothes: select one and click to put it on (what you had on goes back in your bag).
  // Your own jacket, packed in a suitcase: you come to in just a shirt.
  jacket: { name: 'Red jacket', stack: 1, wear: true },
  // Warm hides, warmer still (#88).
  parka: { name: 'Hide parka', stack: 1, wear: true },
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
    this.outfit = null; // what you're wearing over your shirt ('jacket' or 'parka'), or null
    this.found = new Set(); // every item picked up this game, even if it's since been used
  }

  // Slots you can currently put things in: just the hotbar until you find the backpack.
  get usableSlots() {
    return this.hasBackpack ? this.slots.length : HOTBAR_SIZE;
  }

  // Puts the backpack on, with `contents` (its slots, from taking it off) inside.
  putOnBackpack(contents = null) {
    this.hasBackpack = true;
    contents?.forEach((slot, i) => (this.slots[HOTBAR_SIZE + i] = slot));
  }

  // Takes the backpack off. Returns what's in it (its slots), which stays inside.
  takeOffBackpack() {
    this.hasBackpack = false;
    return this.slots.splice(HOTBAR_SIZE, BACKPACK_SIZE, ...Array(BACKPACK_SIZE).fill(null));
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

  // The lit torch in your hand burns down by `minutes` (in-game); tucked away in your
  // inventory, it keeps. Returns how many burned out.
  burnTorches(minutes) {
    let out = 0;
    this.slots.forEach((slot, i) => {
      if (slot?.item !== 'litTorch' || i !== this.selected) return;
      slot.burn -= minutes;
      if (slot.burn > 0) return;
      this.slots[i] = null;
      out++;
    });
    return out;
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
      const slot = { item, count: added };
      if (ITEMS[item].holds) slot.water = 0;
      if (ITEMS[item].durability) slot.durability = ITEMS[item].durability;
      if (ITEMS[item].burns) slot.burn = ITEMS[item].burns;
      this.slots[i] = slot;
      count -= added;
    }
    return count;
  }
}
