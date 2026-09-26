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

const mobileItems = {
    // Accessories
    "case": { name: "📱 Carbon Phone Case", price: 120, type: "item", desc: "Protects your phone from drop damage!" },
    "airpods": { name: "🎧 Wireless Earbuds", price: 250, type: "item", desc: "Listen to server music in ultra HD." },
    "charger": { name: "⚡ Fast Charger 120W", price: 400, type: "item", desc: "Charges your devices in zero seconds!" },
    
    // Flagship Phones (With Cashback)
    "android": { name: "🤖 Flagship Android Phone", price: 1200, type: "item", desc: "Top-tier specs with a massive coin cashback!" },
    "iphone": { name: "🍏 Pro Max Smartphone", price: 2000, type: "item", desc: "The ultimate flex smartphone with a huge jackpot reward!" },
    
    // Tech Roles
    "geek": { name: "💻 Tech Geek Role", price: 800, type: "role", roleName: "Tech Geek", desc: "Exclusive role for true hardware lovers." },
    "nerd": { name: "⚙️ Master Hacker Role", price: 1500, type: "role", roleName: "Master Hacker", desc: "Elite server tech role badge." }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mobileshop')
        .setDescription('Visit the high-tech Mobile & Electronics Store (MediaWorld / Unieuro style)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Browse smartphones, gadgets, and tech roles'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy a gadget or tech role from the store')
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('Select the gadget or role to buy')
                        .setRequired(true)
                        .addChoices(
                            { name: '📱 Carbon Phone Case - 120 Coins', value: 'case' },
                            { name: '🎧 Wireless Earbuds - 250 Coins', value: 'airpods' },
                            { name: '⚡ Fast Charger 120W - 400 Coins', value: 'charger' },
                            { name: '💻 Tech Geek Role - 800 Coins', value: 'geek' },
                            { name: '🤖 Flagship Android Phone - 1200 Coins', value: 'android' },
                            { name: '⚙️ Master Hacker Role - 1500 Coins', value: 'nerd' },
                            { name: '🍏 Pro Max Smartphone - 2000 Coins', value: 'iphone' }
                        ))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const coinsData = getCoinsData();
        const userCoins = coinsData[userId] || 0;

        if (subcommand === 'view') {
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('📱 TechWorld Mobile & Electronics Store')
                .setDescription('Welcome to the gadget hub! Use `/mobileshop buy [item]` to purchase tech accessories, phones, or roles.')
                .addFields(
                    { 
                        name: '🔌 Mobile Accessories & Gadgets', 
                        value: '• **Carbon Phone Case** (`case`) - 120 Coins\n• **Wireless Earbuds** (`airpods`) - 250 Coins\n• **Fast Charger 120W** (`charger`) - 400 Coins', 
                        inline: false 
                    },
                    { 
                        name: '🤖 Flagship Smartphones (With Cashback!)', 
                        value: '• **Flagship Android Phone** (`android`) - 1200 Coins\n• **Pro Max Smartphone** (`iphone`) - 2000 Coins', 
                        inline: false 
                    },
                    { 
                        name: '💻 Exclusive Tech Roles', 
                        value: '• **Tech Geek Role** (`geek`) - 800 Coins\n• **Master Hacker Role** (`nerd`) - 1500 Coins', 
                        inline: false 
                    }
                )
                .setTimestamp()
                .setFooter({ text: `Your Balance: ${userCoins} Coins 🪙` });

            return await interaction.reply({ embeds: [embed] });
        } 
        
        else if (subcommand === 'buy') {
            const itemKey = interaction.options.getString('item');
            const item = mobileItems[itemKey];

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
                        content: `🎉 Success! You purchased **${item.name}** and the tech role has been added to your profile! 💻🚀`, 
                        ephemeral: true 
                    });
                } catch (error) {
                    console.error(error);
                    return await interaction.reply({ content: '❌ Failed to assign the role. Please check bot permissions and role hierarchy.', ephemeral: true });
                }
            } 
            
            else if (item.type === 'item') {
                let cashBackMsg = '';

                if (itemKey === 'android') {
                    const cb = Math.floor(Math.random() * 400) + 200;
                    coinsData[userId] += cb;
                    cashBackMsg = ` 🤖 Unboxing bonus! You received **${cb} coins** trade-in cashback!`;
                } else if (itemKey === 'iphone') {
                    const cb = Math.floor(Math.random() * 800) + 400;
                    coinsData[userId] += cb;
                    cashBackMsg = ` 🍏 Apple ecosystem bonus! Purchasing the Pro Max rewarded you with **${cb} coins** cashback!`;
                }

                saveCoinsData(coinsData);
                return await interaction.reply({ 
                    content: `🎉 Success! You bought **${item.name}** from the Tech Store!${cashBackMsg} 📱✨`, 
                    ephemeral: true 
                });
            }
        }
    },
};
