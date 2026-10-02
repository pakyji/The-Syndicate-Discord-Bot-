const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Updated path matching your exact lowercase 'commands' folder structure on GitHub
const storagePath = path.join(__dirname, '../commands/moderation/securityStorage.json');

function loadData() {
    if (!fs.existsSync(storagePath)) return { antiBadWordsStatus: true, customBadWords: [] };
    return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const data = loadData();
        if (!data.antiBadWordsStatus) return;

        const content = message.content.toLowerCase();

        if (data.customBadWords && Array.isArray(data.customBadWords)) {
            for (const word of data.customBadWords) {
                if (content.includes(word.toLowerCase())) {
                    try {
                        await message.delete();
                        const warning = await message.channel.send(`⚠️ ${message.author}, that word is prohibited.`);
                        setTimeout(() => warning.delete().catch(() => {}), 5000);
                    } catch (error) {
                        console.error('Failed to delete bad word message:', error);
                    }
                    break;
                }
            }
        }
    },
};
