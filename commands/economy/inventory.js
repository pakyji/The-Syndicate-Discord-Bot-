const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const storagePath = path.join(__dirname, 'economyStorage.json');

function loadEconomyData() {
    if (!fs.existsSync(storagePath)) {
        fs.writeFileSync(storagePath, JSON.stringify({}, null, 4));
    }
    return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
}

// Map of categories and item keys
const itemCategories = {
    "Currencies & Wealth": ["gold_nugget", "gold_bar", "diamond_gem", "platinum_ingot", "bitcoin", "ethereum", "ancient_relic", "bag_of_cash", "royal_treasury_bond"],
    "Gambling & Boosters": ["loaded_dice", "four_leaf_clover", "rabbit_foot", "golden_ticket", "vip_casino_pass", "casino_chip_legendary", "lucky_coin", "card_shark_deck", "dealers_visor", "loaded_roulette_ball"],
    "Legendary Trophies": ["golden_skull", "diamond_crown", "cursed_amulet", "hackers_usb", "the_holy_grail", "dragon_scale", "infinity_orb", "pharaohs_mask", "stellar_meteorite"],
    "Combat & Heist Gear": ["iron_dagger", "combat_knife", "submachine_gun", "assault_rifle", "sniper_rifle", "combat_armor", "night_vision_goggles", "smoke_grenade", "c4_explosive_charge"],
    "Protection & Security": ["vault_key", "iron_padlock", "digital_firewall", "forcefield_shield", "security_camera", "guard_dog_contract", "laser_tripwire"],
    "Consumables & Potions": ["energy_drink", "potion_of_greed", "lucky_cocktail", "energy_coffee", "mystery_box", "adrenaline_shot", "elixir_of_wealth", "serum_of_invisibility"],
    "Tools & Working Gear": ["wooden_pickaxe", "iron_pickaxe", "diamond_pickaxe", "netherite_drill", "metal_detector", "fishing_rod", "deep_sea_submersible"],
    "Pets & Companions": ["pet_hamster", "guard_cat", "loyal_dog", "exotic_parrot", "baby_dragon", "cybernetic_panther", "phoenix_hatchling"],
    "Tech & Hacking": ["old_laptop", "rig_mining_gpu", "quantum_server", "master_decoder", "ai_neural_assistant"],
    "Licenses & Permits": ["gun_permit", "casino_license", "immunity_card", "tax_evasion_certificate"],
    "Real Estate & Assets": ["small_shack", "suburban_house", "downtown_apartment", "commercial_warehouse", "luxury_casino_building"],
    "Food & Luxury Items": ["golden_pizza", "caviar_plate", "sports_car", "private_yacht", "penthouse_deed", "private_jet", "supercar_collection", "private_island"]
};

// Helper function to format item names cleanly
function formatItemName(key) {
    return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Check your items, collectibles, weapons, and assets.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check another user\'s inventory')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const economyData = loadEconomyData();

        const userProfile = economyData[targetUser.id] || { wallet: 0, bank: 0, inventory: {} };
        const userInventory = userProfile.inventory || {};

        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🎒 ${targetUser.username}'s Inventory`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🪙 Wallet Balance', value: `\`$${(userProfile.wallet || 0).toLocaleString()}\``, inline: true },
                { name: '🏦 Bank Balance', value: `\`$${(userProfile.bank || 0).toLocaleString()}\``, inline: true }
            )
            .setTimestamp();

        let hasItems = false;

        for (const [categoryName, itemsList] of Object.entries(itemCategories)) {
            let categoryContent = [];

            for (const itemKey of itemsList) {
                const quantity = userInventory[itemKey] || 0;
                if (quantity > 0) {
                    categoryContent.push(`• **${formatItemName(itemKey)}**: \`x${quantity}\``);
                    hasItems = true;
                }
            }

            if (categoryContent.length > 0) {
                embed.addFields({
                    name: `📁 ${categoryName}`,
                    value: categoryContent.join('\n'),
                    inline: false
                });
            }
        }

        if (!hasItems) {
            embed.setDescription('*Your inventory is currently completely empty! Win games or buy items to fill it up.*');
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
