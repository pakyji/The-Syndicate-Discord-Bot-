const axios = require('axios');
const { PermissionFlagsBits } = require('discord.js');

const TRANSLATION_CHANNEL_ID = '1538595475794563167';

// Define the allowed channel IDs where images are permitted
const ALLOWED_IMAGE_CHANNELS = [
    '1536498743505846393',
    '1536500109154451618',
    '1535656663510417469',
    '901702414896365628'
];

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // Allow administrators or moderators to bypass anti-image restrictions
        const isAdminOrMod = message.member.permissions.has(PermissionFlagsBits.Administrator);

        // Anti-Image Filter Feature
        if (!isAdminOrMod) {
            const hasAttachment = message.attachments.size > 0;
            const hasEmbedImage = message.embeds.some(embed => embed.image || embed.thumbnail);

            if (hasAttachment || hasEmbedImage) {
                const isAllowedChannel = ALLOWED_IMAGE_CHANNELS.includes(message.channel.id);

                if (!isAllowedChannel) {
                    try {
                        await message.delete();
                        const allowedMentions = ALLOWED_IMAGE_CHANNELS.map(id => `<#${id}>`).join(', ');
                        const warningMsg = await message.channel.send(
                            `❌ ${message.author}, images are only allowed in ${allowedMentions}!`
                        );
                        setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
                        return;
                    } catch (error) {
                        console.error('Anti-image error:', error);
                    }
                }
            }
        }

        // Translation Feature
        if (message.channel.id === TRANSLATION_CHANNEL_ID) {
            try {
                const encodedText = encodeURIComponent(message.content);
                const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodedText}&langpair=autodetect|en`);
                const translatedText = response.data.responseData.translatedText;

                if (translatedText && translatedText.toLowerCase() !== message.content.toLowerCase()) {
                    await message.channel.send(`💬 **${message.author.username}:** ${translatedText}`);
                    await message.delete().catch(() => {});
                }
            } catch (error) {
                console.error('Translation error:', error);
            }
            return;
        }

        // Automatic Moderation Filter (Bad words & Links)
        const badWords = ['parolaccia1', 'parolaccia2'];
        const contentLower = message.content.toLowerCase();
        const hasBadWord = badWords.some(word => contentLower.includes(word));
        
        const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+)/i;
        const hasLink = linkRegex.test(message.content);

        if (hasBadWord || hasLink) {
            try {
                await message.delete();

                const userId = message.author.id;
                if (!client.autoWarnings) client.autoWarnings = new Map();
                const currentWarns = (client.autoWarnings.get(userId) || 0) + 1;
                client.autoWarnings.set(userId, currentWarns);

                const warningMsg = await message.channel.send(
                    `⚠️ <@${userId}>, your message was deleted because it contained restricted content! (Auto-Warns: ${currentWarns}/3)`
                );
                
                setTimeout(() => warningMsg.delete().catch(() => {}), 5000);

                // DM notification
                try {
                    await message.author.send(`⚠️ Your message in **${message.guild.name}** was deleted because restricted links/words are not allowed. (Auto-Warns: ${currentWarns}/3)`);
                } catch (err) {}

                // Auto-action: 3 warns -> 10 mins timeout
                if (currentWarns >= 3) {
                    const member = await message.guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        await member.timeout(10 * 60 * 1000, 'Accumulated 3 automatic warnings');
                        await message.channel.send(`🚨 <@${userId}> has reached 3 auto-warns and has been put in **timeout** for 10 minutes!`);
                        client.autoWarnings.set(userId, 0);
                    }
                }
            } catch (error) {
                console.error('Auto-moderation error:', error);
            }
            return;
        }

        // Free AI Chat Feature (Works ONLY when the bot is mentioned)
        try {
            if (message.mentions.has(client.user)) {
                await message.channel.sendTyping();

                const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();
                if (!cleanContent) return;

                const prompt = encodeURIComponent(cleanContent);
                const aiRes = await axios.get(`https://api.popcat.xyz/chatbot?msg=${prompt}`);
                
                if (aiRes.data && aiRes.data.response) {
                    await message.reply(aiRes.data.response);
                }
            }
        } catch (error) {
            console.error('AI Chat error:', error);
        }
    },
};
