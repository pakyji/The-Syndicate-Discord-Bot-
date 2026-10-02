const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Updated path matching your exact lowercase 'commands' folder structure on GitHub
const storagePath = path.join(__dirname, '../commands/moderation/securityStorage.json');

function loadData() {
    if (!fs.existsSync(storagePath)) return { antiLinkStatus: true, customBlockedLinks: [] };
    return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const data = loadData();
        if (!data.antiLinkStatus) return;

        const content = message.content.toLowerCase();
        const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
        let isBlocked = urlPattern.test(content);

        // Check custom added links/domains
        if (data.customBlockedLinks && Array.isArray(data.customBlockedLinks)) {
            for (const domain of data.customBlockedLinks) {
                if (content.includes(domain.toLowerCase())) {
                    isBlocked = true;
                    break;
                }
            }
        }

        if (isBlocked) {
            try {
                await message.delete();
                const warning = await message.channel.send(`⚠️ ${message.author}, links are not allowed here.`);
                setTimeout(() => warning.delete().catch(() => {}), 5000);
            } catch (error) {
                console.error('Failed to delete link message:', error);
            }
        }
    },
};
