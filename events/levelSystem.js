const { EmbedBuilder } = require('discord.js');

const levels = new Map();
const XP_PER_MESSAGE = 15;
const XP_COOLDOWN = 60000;
const cooldowns = new Map();

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (!message.guild || message.author.bot) return;

        const userId = message.author.id;
        const now = Date.now();

        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + XP_COOLDOWN;
            if (now < expirationTime) return;
        }
        cooldowns.set(userId, now);

        let userData = levels.get(userId) || { xp: 0, level: 1 };
        userData.xp += XP_PER_MESSAGE;

        const requiredXp = userData.level * 100;

        if (userData.xp >= requiredXp) {
            userData.level += 1;
            userData.xp = 0;

            // Simple & Clean Level Up Message in English
            const levelEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setDescription(`🎉 Congratulations <@${userId}>! You have leveled up to **Level ${userData.level}**! 🚀`);

            await message.channel.send({ embeds: [levelEmbed] }).catch(() => {});
        }

        levels.set(userId, userData);
    },
};
