// Things the player can make from what they're carrying. Add new recipes here.
export const RECIPES = [
  {
    item: 'campfire',
    count: 1,
    cost: { wood: 5 },
    description: 'Place it on open ground, then light it with a lighter (E)',
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
    item: 'rope',
    name: 'Rope (from hide)',
    count: 2,
    cost: { hide: 1 },
    description: 'Cut a hide into strips',
  },
  {
    item: 'flask',
    count: 1,
    cost: { hide: 2, rope: 1 },
    description: 'Fill it at the lake or river, then drink from it anywhere (3 drinks)',
  },
];

// A recipe shows up once the player has found everything it's made from.
export function isKnown(inventory, recipe) {
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
