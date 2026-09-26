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

// Yahan aap apne shop ke items aur unka price/role name set kar sakte hain
const shopItems = {
    "vip": { name: "VIP Role", price: 500, roleName: "VIP" },
    "legend": { name: "Legend Role", price: 1000, roleName: "Legend" }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View items available in the coin shop or buy them')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View shop items'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy an item from the shop')
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('Item keyword to buy')
                        .setRequired(true)
                        .addChoices(
                            { name: 'VIP Role (500 coins)', value: 'vip' },
                            { name: 'Legend Role (1000 coins)', value: 'legend' }
                        ))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🛒 Server Coin Shop')
                .setDescription('Use `/shop buy [item]` to purchase roles using your coins!')
                .addFields(
                    { name: '⭐ VIP Role', value: 'Price: **500 Coins**\nKeyword: `vip`', inline: true },
                    { name: '🔥 Legend Role', value: 'Price: **1000 Coins**\nKeyword: `legend`', inline: true }
                )
                .setTimestamp();

            return await interaction.reply({ embeds: [embed] });
        } 
        
        else if (subcommand === 'buy') {
            const itemKey = interaction.options.getString('item');
            const item = shopItems[itemKey];

            if (!item) {
                return await interaction.reply({ content: 'Invalid item selected!', ephemeral: true });
            }

            const userId = interaction.user.id;
            const coinsData = getCoinsData();
            const userCoins = coinsData[userId] || 0;

            // Check if user has enough coins
            if (userCoins < item.price) {
                return await interaction.reply({ 
                    content: `❌ You don't have enough coins! You need **${item.price}** coins, but you only have **${userCoins}** coins.`, 
                    ephemeral: true 
                });
            }

            // Find the role in the server
            const role = interaction.guild.roles.cache.find(r => r.name === item.roleName);
            if (!role) {
                return await interaction.reply({ 
                    content: `⚠️ Error: The role **"${item.roleName}"** does not exist in this server yet. Please ask an admin to create it!`, 
                    ephemeral: true 
                });
            }

            try {
                // Deduct coins and save
                coinsData[userId] -= item.price;
                saveCoinsData(coinsData);

                // Give role to member
                await interaction.member.roles.add(role);

                await interaction.reply({ 
                    content: `🎉 Success! You bought **${item.name}** for **${item.price}** coins! The role has been added to you.`, 
                    ephemeral: true 
                });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: '❌ Failed to give you the role. Make sure the bot has proper permissions and its role is higher than the reward role!', ephemeral: true });
            }
        }
    },
};
