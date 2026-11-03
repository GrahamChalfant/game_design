import { ARROWS_PER_CRAFT, BOW_DURABILITY, KNIFE_DURABILITY } from './hunting.js';

// Things the player can make from what they're carrying. Add new recipes here.
export const RECIPES = [
  {
    item: 'campfire',
    count: 1,
    cost: { wood: 5 },
    description: 'Place it on open ground, then light it with a lighter (E)',
  },
  {
    item: 'shelter',
    count: 1,
    cost: { wood: 20, rope: 6, hide: 4 },
    description: 'A hide-covered shelter. Keeps you warm, and you can sleep in it at night',
  },
  {
    item: 'parka',
    name: 'Hide parka',
    count: 1,
    cost: { hide: 6, rope: 3 },
    description: 'Warm hides stitched into a coat. Wear it to brave the cold up the mountains',
  },
  {
    item: 'trap',
    count: 1,
    cost: { wood: 3, rope: 1 },
    description: 'Set it on the ground to catch rabbits. Breaks after one catch',
  },
  {
    item: 'rope',
    name: 'Rope (from intestines)',
    count: 1,
    cost: { gut: 1 },
    description: 'Dry and twist intestines into cord',
  },
  {
    item: 'flask',
    count: 1,
    cost: { hide: 2, rope: 1 },
    description: 'Fill it at the lake or river, then drink from it anywhere (3 drinks)',
  },
  {
    item: 'bowstring',
    name: 'Bowstring (from intestines)',
    count: 1,
    cost: { gut: 1 },
    description: 'Twist intestines into a strong string for a bow',
  },
  {
    item: 'bowstring',
    name: 'Bowstring (from rope)',
    count: 1,
    cost: { rope: 1 },
    description: 'Twist gut rope tight into a strong string for a bow',
  },
  {
    item: 'bow',
    count: 1,
    cost: { wood: 3, bowstring: 2 },
    requires: 'bowstring',
    description: `Equip it and click to shoot. Breaks after ${BOW_DURABILITY} shots`,
  },
  {
    item: 'knife',
    name: 'Stone knife',
    count: 1,
    cost: { wood: 1, stone: 1 },
    description: `Equip it and click to stab up close. Boars take a few stabs. Breaks after ${KNIFE_DURABILITY} hits`,
  },
  {
    item: 'arrow',
    count: ARROWS_PER_CRAFT,
    cost: { wood: 1, stone: 1 },
    requires: 'bow',
    description: 'One hit brings down a deer or a rabbit. Arrows are lost once shot',
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
