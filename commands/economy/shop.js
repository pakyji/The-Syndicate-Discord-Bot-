const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const storagePath = path.join(__dirname, 'economyStorage.json');

function loadEconomyData() {
    if (!fs.existsSync(storagePath)) {
        fs.writeFileSync(storagePath, JSON.stringify({}, null, 4));
    }
    return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
}

function saveEconomyData(data) {
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 4));
}

// Lista di oggetti acquistabili con prezzi definiti
const shopItems = {
    "wooden_pickaxe": { name: "Wooden Pickaxe", price: 500, category: "Tools" },
    "iron_pickaxe": { name: "Iron Pickaxe", price: 2500, category: "Tools" },
    "diamond_pickaxe": { name: "Diamond Pickaxe", price: 10000, category: "Tools" },
    "netherite_drill": { name: "Netherite Drill", price: 45000, category: "Tools" },
    "lucky_coin": { name: "Lucky Coin", price: 5000, category: "Gambling" },
    "loaded_dice": { name: "Loaded Dice", price: 7500, category: "Gambling" },
    "card_shark_deck": { name: "Card Shark Deck", price: 12000, category: "Gambling" },
    "iron_padlock": { name: "Iron Padlock", price: 3000, category: "Security" },
    "vault_key": { name: "Vault Key", price: 15000, category: "Security" },
    "energy_drink": { name: "Energy Drink", price: 350, category: "Consumables" },
    "mystery_box": { name: "Mystery Box", price: 2000, category: "Consumables" },
    "sports_car": { name: "Sports Car", price: 150000, category: "Luxury" }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse the item shop and buy tools, gambling boosters, and security gear.')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('The key or name of the item you want to buy')
                .setRequired(false)
                .addChoices(
                    { name: 'Wooden Pickaxe ($500)', value: 'wooden_pickaxe' },
                    { name: 'Iron Pickaxe ($2,500)', value: 'iron_pickaxe' },
                    { name: 'Diamond Pickaxe ($10,000)', value: 'diamond_pickaxe' },
                    { name: 'Netherite Drill ($45,000)', value: 'netherite_drill' },
                    { name: 'Lucky Coin ($5,000)', value: 'lucky_coin' },
                    { name: 'Loaded Dice ($7,500)', value: 'loaded_dice' },
                    { name: 'Card Shark Deck ($12,000)', value: 'card_shark_deck' },
                    { name: 'Iron Padlock ($3,000)', value: 'iron_padlock' },
                    { name: 'Vault Key ($15,000)', value: 'vault_key' },
                    { name: 'Energy Drink ($350)', value: 'energy_drink' },
                    { name: 'Mystery Box ($2,000)', value: 'mystery_box' },
                    { name: 'Sports Car ($150,000)', value: 'sports_car' }
                )),

    async execute(interaction) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const selectedItemKey = interaction.options.getString('item');

        const economyData = loadEconomyData();
        if (!economyData[userId]) {
            economyData[userId] = { wallet: 0, bank: 0, inventory: {} };
        }

        const userProfile = economyData[userId];
        const userWallet = userProfile.wallet || 0;

        // Se l'utente non ha scelto un oggetto, mostra la vetrina del negozio
        if (!selectedItemKey) {
            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🛒 Server Economy Shop')
                .setDescription('Use `/shop [item]` to purchase any of the available items below using your wallet cash!')
                .setTimestamp();

            let categories = {};
            for (const [key, data] of Object.entries(shopItems)) {
                if (!categories[data.category]) categories[data.category] = [];
                categories[data.category].push(`• **${data.name}**: \`$${data.price.toLocaleString()}\` \`(/shop item:${key})\``);
            }

            for (const [catName, items] of Object.entries(categories)) {
                embed.addFields({ name: `📁 ${catName}`, value: items.join('\n'), inline: false });
            }

            return await interaction.editReply({ embeds: [embed] });
        }

        // Gestione dell'acquisto
        const itemData = shopItems[selectedItemKey];
        if (!itemData) {
            return await interaction.editReply({ content: '❌ Invalid item selected!' });
        }

        if (userWallet < itemData.price) {
            return await interaction.editReply({
                content: `❌ You cannot afford this! You need \`$${itemData.price.toLocaleString()}\`, but your wallet balance is only \`$${userWallet.toLocaleString()}\`.`
            });
        }

        // Deduci i soldi ed aggiungi l'oggetto all'inventario
        userProfile.wallet -= itemData.price;
        if (!userProfile.inventory) userProfile.inventory = {};
        userProfile.inventory[selectedItemKey] = (userProfile.inventory[selectedItemKey] || 0) + 1;

        saveEconomyData(economyData);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🛍️ Purchase Successful!')
            .setDescription(`You have successfully bought **${itemData.name}** for \`$${itemData.price.toLocaleString()}\`!`)
            .addFields(
                { name: 'Item Added', value: `\`x1 ${itemData.name}\``, inline: true },
                { name: 'Remaining Wallet', value: `\`$${userProfile.wallet.toLocaleString()}\``, inline: true }
            )
            .setFooter({ text: 'Check your /inventory to see your new item in action!' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
