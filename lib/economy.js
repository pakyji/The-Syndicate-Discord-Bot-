/**
 * Shared economy catalog.
 *
 * The original duplicated item definitions across shop.js, mine.js,
 * minimarket.js, mobileshop.js and simshop.js, so a price change had to be made
 * in five places and the files drifted apart. This is the single source of truth.
 */

/** Tools, ordered best-first — mine.js picks the first one the user owns. */
const PICKAXES = [
    { key: 'netherite_drill', name: 'Netherite Drill', minReward: 1500, maxReward: 4000, rareChance: 0.4 },
    { key: 'diamond_pickaxe', name: 'Diamond Pickaxe', minReward: 800, maxReward: 2000, rareChance: 0.25 },
    { key: 'iron_pickaxe', name: 'Iron Pickaxe', minReward: 300, maxReward: 900, rareChance: 0.1 },
    { key: 'wooden_pickaxe', name: 'Wooden Pickaxe', minReward: 100, maxReward: 400, rareChance: 0.02 },
];

const COMMON_DROPS = ['gold_nugget', 'gold_bar'];
const RARE_DROPS = ['diamond_gem', 'platinum_ingot', 'stellar_meteorite'];

/** Every purchasable item across all shops. */
const ITEMS = {
    // Tools
    wooden_pickaxe: { name: 'Wooden Pickaxe', price: 500, category: 'Tools' },
    iron_pickaxe: { name: 'Iron Pickaxe', price: 2500, category: 'Tools' },
    diamond_pickaxe: { name: 'Diamond Pickaxe', price: 10000, category: 'Tools' },
    netherite_drill: { name: 'Netherite Drill', price: 45000, category: 'Tools' },

    // Gambling boosters
    lucky_coin: { name: 'Lucky Coin', price: 5000, category: 'Gambling' },
    loaded_dice: { name: 'Loaded Dice', price: 7500, category: 'Gambling' },
    card_shark_deck: { name: 'Card Shark Deck', price: 12000, category: 'Gambling' },
    casino_chip_legendary: { name: 'Legendary Casino Chip', price: 60000, category: 'Gambling' },
    golden_ticket: { name: 'Golden Ticket', price: 25000, category: 'Gambling' },

    // Security
    iron_padlock: { name: 'Iron Padlock', price: 3000, category: 'Security' },
    vault_key: { name: 'Vault Key', price: 15000, category: 'Security' },

    // Consumables
    energy_drink: { name: 'Energy Drink', price: 350, category: 'Consumables' },
    mystery_box: { name: 'Mystery Box', price: 2000, category: 'Consumables' },

    // Luxury
    sports_car: { name: 'Sports Car', price: 150000, category: 'Luxury' },

    // Minerals (not for sale — mining drops only, but shown in inventory)
    gold_nugget: { name: 'Gold Nugget', price: 0, category: 'Minerals', sellPrice: 150 },
    gold_bar: { name: 'Gold Bar', price: 0, category: 'Minerals', sellPrice: 900 },
    diamond_gem: { name: 'Diamond Gem', price: 0, category: 'Minerals', sellPrice: 4000 },
    platinum_ingot: { name: 'Platinum Ingot', price: 0, category: 'Minerals', sellPrice: 6500 },
    stellar_meteorite: { name: 'Stellar Meteorite', price: 0, category: 'Minerals', sellPrice: 15000 },
};

/** Cap any single bet so a typo cannot wipe an economy. */
const MAX_BET = 1000000;

function itemName(key) {
    return ITEMS[key]?.name || formatKey(key);
}

function formatKey(key) {
    return String(key).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function randomOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function money(n) {
    return `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
}

module.exports = {
    PICKAXES,
    COMMON_DROPS,
    RARE_DROPS,
    ITEMS,
    MAX_BET,
    itemName,
    formatKey,
    randomOf,
    money,
};
