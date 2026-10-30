// Things the player can make from what they're carrying. Add new recipes here.
export const RECIPES = [
  {
    item: 'campfire',
    count: 1,
    cost: { wood: 5 },
    description: 'Place it on open ground. Burns for 2 hours; add wood with E',
  },
  {
    item: 'trap',
    count: 1,
    cost: { wood: 3 },
    description: 'Set it on the ground to catch rabbits',
  },
];

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
