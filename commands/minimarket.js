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

// Badi Mini Market Inventory (Lidl/Coop/Conad/Eurospar Style)
const marketItems = {
    // Snacks & Drinks
    "coffee": { name: "☕ Hot Espresso", price: 30, type: "item", desc: "Fresh Italian coffee to stay active!" },
    "energy": { name: "⚡ Energy Drink", price: 50, type: "item", desc: "Boost your chat energy!" },
    "pizza": { name: "🍕 Slice of Pizza", price: 80, type: "item", desc: "Delicious cheesy Italian pizza slice." },
    "snacks": { name: "🍿 Movie Popcorn", price: 100, type: "item", desc: "Crunchy snacks for gaming nights." },
    
    // Fun & Mystery
    "scratch": { name: "🎟️ Lucky Scratch Card", price: 150, type: "item", desc: "Scratch to win random coins back!" },
    "mystery": { name: "🎁 Super Mystery Box", price: 300, type: "item", desc: "Contains a massive coin jackpot!" },
    
    // Server Roles
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
                .setColor('#e67e22') // Supermarket warm orange/green vibe
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

            // Check if user has enough coins
            if (userCoins < item.price) {
                return await interaction.reply({ 
                    content: `❌ Aapke paas itne coins nahi hain! Aapko **${item.price}** coins chahiye, lekin aapke paas sirf **${userCoins}** coins hain.`, 
                    ephemeral: true 
                });
            }

            // Deduct coins
            coinsData[userId] -= item.price;

            // Handle Roles
            if (item.type === 'role') {
                const role = interaction.guild.roles.cache.find(r => r.name === item.roleName);
                if (!role) {
                    return await interaction.reply({ 
                        content: `⚠️ Error: Server mein **"${item.roleName}"** naam ka role nahi mila. Admin se kahein pehle role banayein!`, 
                        ephemeral: true 
                    });
                }

                try {
                    await interaction.member.roles.add(role);
                    saveCoinsData(coinsData);
                    return await interaction.reply({ 
                        content: `🎉 Mubarak ho! Aapne **${item.name}** successfully kharid liya hai aur role aapko mil gaya hai! 🛒✨`, 
                        ephemeral: true 
                    });
                } catch (error) {
                    console.error(error);
                    return await interaction.reply({ content: '❌ Role assign karne mein error aayi. Check karein ki bot ka role upar hai ya nahi.', ephemeral: true });
                }
            } 
            
            // Handle Fun Inventory Items / Gambling Mini-games
            else if (item.type === 'item') {
                let extraMsg = '';

                if (itemKey === 'scratch') {
                    const winCoins = Math.floor(Math.random() * 250) + 50; // Win between 50 to 300 back
                    coinsData[userId] += winCoins;
                    extraMsg = ` 🎟️ Scratch card kholne par aapne **${winCoins} coins** jeet liye!`;
                } else if (itemKey === 'mystery') {
                    const jackpot = Math.floor(Math.random() * 600) + 150; // Win between 150 to 750 back
                    coinsData[userId] += jackpot;
                    extraMsg = ` 🎁 Jackpot! Mystery Box kholne par aapko **${jackpot} coins** ka bada inaam mila!`;
                }

                saveCoinsData(coinsData);
                return await interaction.reply({ 
                    content: `🎉 Success! Aapne market se **${item.name}** kharid liya hai!${extraMsg} 🛒🛍️`, 
                    ephemeral: true 
                });
            }
        }
    },
};
