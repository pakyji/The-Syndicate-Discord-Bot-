const { Events } = require('discord.js');

const TARGET_CHANNEL_ID = '1536500109154451618';

const putinResponses = [
    "That is a very interesting perspective. We are monitoring the situation closely.",
    "Strength and discipline are the foundation of any successful operation.",
    "Sanctions or no sanctions, our objective remains crystal clear.",
    "Let us look at the long-term strategy, not just temporary distractions.",
    "History will be the ultimate judge of our actions today.",
    "A leader must always remain calm, calculate every move, and act decisively."
];

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignore bot messages and DMs
        if (message.author.bot || !message.guild) return;

        // Check if the message is in the target channel
        if (message.channel.id !== TARGET_CHANNEL_ID) return;

        // Check if the bot is specifically pinged/mentioned in that channel
        const isMentioned = message.mentions.has(message.client.user);

        if (isMentioned) {
            const randomResponse = putinResponses[Math.floor(Math.random() * putinResponses.length)];
            await message.reply(`🇷🇺 **Vladimir Putin:** ${randomResponse}`);
        }
    },
};
