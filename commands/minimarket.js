const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = './coins.json';

function getCoinsData() {
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function saveCoinsData(data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

const marketItems = {
    // Snacks & Refreshments
    "coffee": { name: "☕ Hot Espresso", price: 30, type: "item", desc: "Fresh Italian coffee to stay active!" },
    "energy": { name: "⚡ Energy Drink", price: 50, type: "item", desc: "Boost your chat energy!" },
    "pizza": { name: "🍕 Slice of Pizza", price: 80, type: "item", desc: "Delicious cheesy Italian pizza slice." },
    "snacks": { name: "🍿 Movie Popcorn", price: 100, type: "item", desc: "Crunchy snacks for gaming nights." },
    
    // Fun & Mystery Items
    "scratch": { name: "🎟️ Lucky Scratch Card", price: 150, type: "item", desc: "Scratch to win random coins back!" },
    "mystery": { name: "🎁 Super Mystery Box", price: 300, type: "item", desc: "Contains a massive coin jackpot!" },
    
    // Exclusive Roles
    "vip": { name: "⭐ VIP Role", price: 500, type: "role", roleName: "VIP", desc: "Get the exclusive VIP role badge." },
    "legend": { name: "🔥 Legend Role", price: 1000, type: "role", roleName: "Legend", desc: "The ultimate flex role on the server." }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('minimarket')
        .setDescription('Visit the ultimate Mini Market (Coop, Lidl, Conad style)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Browse all products in the Mini Market'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy any item from the Mini Market')
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('Select the item you want to buy')
                        .setRequired(true)
                        .addChoices(
                            { name: '☕ Hot Espresso - 30 Coins', value: 'coffee' },
                            { name: '⚡ Energy Drink - 50 Coins', value: 'energy' },
                            { name: '🍕 Slice of Pizza - 80 Coins', value: 'pizza' },
                            { name: '🍿 Movie Popcorn - 100 Coins', value: 'snacks' },
                            { name: '🎟️ Lucky Scratch Card - 150 Coins', value: 'scratch' },
                            { name: '🎁 Super Mystery Box - 300 Coins', value: 'mystery' },
                            { name: '⭐ VIP Role - 500 Coins', value: 'vip' },
                            { name: '🔥 Legend Role - 1000 Coins', value: 'legend' }
                        ))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const coinsData = getCoinsData();
        const userCoins = coinsData[userId] || 0;

        if (subcommand === 'view') {
            const embed = new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle('🛒 Hyper Mini Market (Coop, Lidl, Conad & Eurospar)')
                .setDescription('Welcome! Use `/minimarket buy [item]` to purchase food, items, or special roles using your coins.')
                .addFields(
                    { 
                        name: '☕ Snacks & Refreshments', 
                        value: '• **Hot Espresso** (`coffee`) - 30 Coins\n• **Energy Drink** (`energy`) - 50 Coins\n• **Slice of Pizza** (`pizza`) - 80 Coins\n• **Movie Popcorn** (`snacks`) - 100 Coins', 
                        inline: false 
                    },
                    { 
                        name: '🎲 Fun & Mystery Items', 
                        value: '• **Lucky Scratch Card** (`scratch`) - 150 Coins\n• **Super Mystery Box** (`mystery`) - 300 Coins', 
                        inline: false 
                    },
                    { 
                        name: '⭐ Exclusive Server Roles', 
                        value: '• **VIP Role** (`vip`) - 500 Coins\n• **Legend Role** (`legend`) - 1000 Coins', 
                        inline: false 
                    }
                )
                .setTimestamp()
                .setFooter({ text: `Your Current Balance: ${userCoins} Coins 🪙` });

            return await interaction.reply({ embeds: [embed] });
        } 
        
        else if (subcommand === 'buy') {
            const itemKey = interaction.options.getString('item');
            const item = marketItems[itemKey];

            if (!item) {
                return await interaction.reply({ content: '❌ Invalid product selected!', ephemeral: true });
            }

            if (userCoins < item.price) {
                return await interaction.reply({ 
                    content: `❌ You do not have enough coins! You need **${item.price}** coins, but you only have **${userCoins}** coins.`, 
                    ephemeral: true 
                });
            }

            coinsData[userId] -= item.price;

            if (item.type === 'role') {
                const role = interaction.guild.roles.cache.find(r => r.name === item.roleName);
                if (!role) {
                    return await interaction.reply({ 
                        content: `⚠️ Error: The role **"${item.roleName}"** does not exist in this server. Please ask an admin to create it first!`, 
                        ephemeral: true 
                    });
                }

                try {
                    await interaction.member.roles.add(role);
                    saveCoinsData(coinsData);
                    return await interaction.reply({ 
                        content: `🎉 Success! You have successfully purchased **${item.name}** and received the role! 🛒✨`, 
                        ephemeral: true 
                    });
                } catch (error) {
                    console.error(error);
                    return await interaction.reply({ content: '❌ Failed to assign the role. Please check bot permissions and role hierarchy.', ephemeral: true });
                }
            } 
            
            else if (item.type === 'item') {
                let extraMsg = '';

                if (itemKey === 'scratch') {
                    const winCoins = Math.floor(Math.random() * 250) + 50;
                    coinsData[userId] += winCoins;
                    extraMsg = ` 🎟️ You scratched the card and won **${winCoins} coins** back!`;
                } else if (itemKey === 'mystery') {
                    const jackpot = Math.floor(Math.random() * 600) + 150;
                    coinsData[userId] += jackpot;
                    extraMsg = ` 🎁 Jackpot! Opening the Mystery Box rewarded you with **${jackpot} coins**!`;
                }

                saveCoinsData(coinsData);
                return await interaction.reply({ 
                    content: `🎉 Success! You bought **${item.name}** from the market!${extraMsg} 🛒🛍️`, 
                    ephemeral: true 
                });
            }
        }
    },
};
