import { ARROWS_PER_CRAFT, BOW_DURABILITY, KNIFE_DURABILITY } from './hunting.js';

// The crafting menu's groups, in order: each folds open to show its recipes.
export const GROUPS = [
  { id: 'fire', name: 'Fire & cooking' },
  { id: 'hunting', name: 'Weapons & hunting' },
  { id: 'shelter', name: 'Shelter' },
  { id: 'gear', name: 'Clothing & gear' },
  { id: 'materials', name: 'Materials' },
];

// Things the player can make from what they're carrying, each in one of GROUPS. Add new
// recipes here.
export const RECIPES = [
  {
    item: 'campfire',
    group: 'fire',
    count: 1,
    cost: { stick: 6 },
    description: 'Place it on open ground, then light it with a lighter or a match (E)',
  },
  {
    item: 'spit',
    group: 'fire',
    name: 'Cooking spit',
    count: 1,
    cost: { stick: 3 },
    description: 'Set it up over a campfire (click next to one), then put raw meat on it to cook',
  },
  {
    item: 'shelter',
    group: 'shelter',
    count: 1,
    cost: { stick: 20, rope: 6, hide: 4 },
    description: 'A hide-covered shelter. Keeps you warm, and you can sleep in it at night',
  },
  {
    item: 'torch',
    group: 'fire',
    count: 1,
    cost: { stick: 2 },
    description: 'Click to light it with a lighter or a match (or at a burning campfire). Lights up the dark for a few hours',
  },
  {
    item: 'parka',
    group: 'gear',
    name: 'Hide parka',
    count: 1,
    cost: { hide: 6, rope: 3 },
    description: 'Warm hides stitched into a coat. Wear it to brave the cold up the mountains',
  },
  {
    item: 'bandage',
    group: 'gear',
    name: 'Bandages (from hide)',
    count: 2,
    cost: { hide: 1 },
    description: 'Cut a hide into soft strips. Click and hold to bandage yourself up',
  },
  {
    item: 'trap',
    group: 'hunting',
    count: 1,
    cost: { stick: 3, rope: 1 },
    description: 'Set it on the ground to catch rabbits. Breaks after one catch',
  },
  {
    item: 'rope',
    group: 'materials',
    name: 'Rope (from intestines)',
    count: 1,
    cost: { gut: 1 },
    description: 'Dry and twist intestines into cord',
  },
  {
    item: 'flask',
    group: 'gear',
    count: 1,
    cost: { hide: 2, rope: 1 },
    description: 'Fill it at the lake or river, then drink from it anywhere (3 drinks)',
  },
  {
    item: 'bowstring',
    group: 'materials',
    name: 'Bowstring (from intestines)',
    count: 1,
    cost: { gut: 1 },
    description: 'Twist intestines into a strong string for a bow',
  },
  {
    item: 'bowstring',
    group: 'materials',
    name: 'Bowstring (from rope)',
    count: 1,
    cost: { rope: 1 },
    description: 'Twist gut rope tight into a strong string for a bow',
  },
  {
    item: 'bow',
    group: 'hunting',
    count: 1,
    cost: { stick: 3, bowstring: 2 },
    requires: 'bowstring',
    description: `Equip it, hold the mouse button to draw and let go to shoot. Breaks after ${BOW_DURABILITY} shots`,
  },
  {
    item: 'knife',
    group: 'hunting',
    name: 'Stone knife',
    count: 1,
    cost: { stick: 1, stone: 1 },
    description: `Equip it and click to stab up close, or hold it at a young tree to cut sticks. A deer takes two. Breaks after ${KNIFE_DURABILITY} hits`,
  },
  {
    item: 'arrow',
    group: 'hunting',
    count: ARROWS_PER_CRAFT,
    cost: { stick: 1, stone: 1 },
    requires: 'bow',
    description: 'One hit brings down a deer or a rabbit. Pick up the ones that miss',
  },
];

// A recipe shows up once the player has found everything it's made from, and is carrying
// its `requires` item (e.g. arrows only once you have a bow).
export function isKnown(inventory, recipe) {
  if (recipe.requires && inventory.count(recipe.requires) === 0) return false;
  return Object.keys(recipe.cost).every((item) => inventory.found.has(item));
}

export function canCraft(inventory, recipe) {
  return Object.entries(recipe.cost).every(([item, count]) => inventory.count(item) >= count);
}

// Spends the ingredients and adds the result. Returns false if it couldn't be made.
export function craft(inventory, recipe) {
  if (!canCraft(inventory, recipe)) return false;
  for (const [item, count] of Object.entries(recipe.cost)) inventory.remove(item, count);
  const leftOver = inventory.add(recipe.item, recipe.count);
  if (leftOver > 0) {
    // No room: give the ingredients back.
    inventory.remove(recipe.item, recipe.count - leftOver);
    for (const [item, count] of Object.entries(recipe.cost)) inventory.add(item, count);
    return false;
  }
  return true;
}
