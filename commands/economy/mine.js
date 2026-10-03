const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const storagePath = path.join(__dirname, 'economyStorage.json');
const cooldowns = new Map(); // Cooldown to prevent spam (30 seconds)

function loadEconomyData() {
    if (!fs.existsSync(storagePath)) {
        fs.writeFileSync(storagePath, JSON.stringify({}, null, 4));
    }
    return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
}

function saveEconomyData(data) {
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 4));
}

// Pickaxes tiers and their drop rates / bonuses
const pickaxes = [
    { key: 'netherite_drill', name: 'Netherite Drill', minReward: 1500, maxReward: 4000, rareChance: 0.4 },
    { key: 'diamond_pickaxe', name: 'Diamond Pickaxe', minReward: 800, maxReward: 2000, rareChance: 0.25 },
    { key: 'iron_pickaxe', name: 'Iron Pickaxe', minReward: 300, maxReward: 900, rareChance: 0.1 },
    { key: 'wooden_pickaxe', name: 'Wooden Pickaxe', minReward: 100, maxReward: 400, rareChance: 0.02 }
];

// Possible loot drops when mining
const commonDrops = ['gold_nugget', 'gold_bar'];
const rareDrops = ['diamond_gem', 'platinum_ingot', 'stellar_meteorite'];

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function formatItemName(key) {
    return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Go mining using your pickaxe to earn cash and rare minerals!'),

    async execute(interaction) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        
        // Check cooldown (30 seconds)
        const cooldownTime = 30 * 1000;
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + cooldownTime;
            if (now < expirationTime) {
                const timeLeft = Math.ceil((expirationTime - now) / 1000);
                return await interaction.editReply({ content: `⏳ You are exhausted! Please wait **${timeLeft}s** before mining again.` });
            }
        }
        
        const now = Date.now();
        cooldowns.set(userId, now);

        const economyData = loadEconomyData();
        if (!economyData[userId]) {
            economyData[userId] = { wallet: 0, bank: 0, inventory: {} };
        }

        const userInventory = economyData[userId].inventory || {};

        // Find the best pickaxe the user owns
        let activePickaxe = null;
        for (const p of pickaxes) {
            if ((userInventory[p.key] || 0) > 0) {
                activePickaxe = p;
                break;
            }
        }

        // If user has no pickaxe, give them a makeshift bare-hands experience or default low reward
        let cashEarned = 0;
        let foundItem = null;
        let pickaxeUsedText = 'Bare Hands';

        if (activePickaxe) {
            pickaxeUsedText = activePickaxe.name;
            cashEarned = Math.floor(Math.random() * (activePickaxe.maxReward - activePickaxe.minReward + 1)) + activePickaxe.minReward;
            
            // Check if they find an item based on pickaxe's rare chance
            if (Math.random() < activePickaxe.rareChance) {
                foundItem = getRandomItem(rareDrops);
            } else {
                foundItem = getRandomItem(commonDrops);
            }
        } else {
            // No pickaxe penalty (very small reward)
            cashEarned = Math.floor(Math.random() * 50) + 10;
            if (Math.random() < 0.05) foundItem = 'gold_nugget';
        }

        // Update user balance and inventory
        economyData[userId].wallet += cashEarned;
        if (foundItem) {
            userInventory[foundItem] = (userInventory[foundItem] || 0) + 1;
        }
        economyData[userId].inventory = userInventory;

        saveEconomyData(economyData);

        const embed = new EmbedBuilder()
            .setColor(0xCD7F32) // Bronze/Mining color
            .setTitle('⛏️ Mining Expedition Successful!')
            .setDescription(`You went down into the mines using your **${pickaxeUsedText}** and dug deep into the bedrock.`)
            .addFields(
                { name: '💰 Cash Earned', value: `\`+$${cashEarned.toLocaleString()}\``, inline: true },
                { name: '🎁 Mineral Found', value: foundItem ? `\`x1 ${formatItemName(foundItem)}\`` : '*Nothing special found this time*', inline: true }
            )
            .setFooter({ text: 'Tip: Buy better pickaxes or drills to earn much more cash and rare gems!' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
