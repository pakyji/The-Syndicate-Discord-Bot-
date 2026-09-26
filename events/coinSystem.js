const { Events } = require('discord.js');
const fs = require('fs');
const path = './coins.json';

// Helper function to read/write coins database
function getCoinsData() {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function saveCoinsData(data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// Cooldown tracker to prevent coin farming via spam (60 seconds per user)
const cooldowns = new Set();

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignore bots or messages outside servers
        if (message.author.bot || !message.guild) return;

        // Only give coins to members with the 'Verified' role
        const VERIFIED_ROLE_NAME = 'Verified';
        const member = message.member;
        if (!member || !member.roles.cache.some(r => r.name === VERIFIED_ROLE_NAME)) return;

        const userId = message.author.id;

        // Cooldown check (60 seconds)
        if (cooldowns.has(userId)) return;

        cooldowns.add(userId);
        setTimeout(() => cooldowns.delete(userId), 60 * 1000);

        // Load coins data and add random coins (5 to 15)
        const coinsData = getCoinsData();
        if (!coinsData[userId]) {
            coinsData[userId] = 0;
        }

        const earnedCoins = Math.floor(Math.random() * 11) + 5;
        coinsData[userId] += earnedCoins;

        saveCoinsData(coinsData);
    }
};
