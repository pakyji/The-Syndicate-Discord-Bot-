const axios = require('axios');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const TRANSLATION_CHANNEL_ID = '1538595475794563167';
const ALERT_CHANNEL_ID = '902047746624749588';

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // 1. Mass Mention / Raid Detection (@everyone or @here)
        if (message.mentions.everyone) {
            try {
                await message.delete();
                
                const warningMsg = await message.channel.send({
                    content: `⚠️ <@${message.author.id}>, '@everyone' or '@here' mentions are restricted to prevent raids!`
                });
                setTimeout(() => warningMsg.delete().catch(() => {}), 5000);

                const alertChannel = message.guild.channels.cache.get(ALERT_CHANNEL_ID);
                if (alertChannel) {
                    const raidEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🚨 Raid / Mass Mention Alert')
                        .setDescription(`**User:** <@${message.author.id}>\n**Channel:** <#${message.channel.id}>\n**Action:** Tried using '@everyone' / '@here'. Message deleted.`)
                        .setTimestamp();

                    await alertChannel.send({ embeds: [raidEmbed] });
                }
            } catch (err) {
                console.error('Raid detector error:', err);
            }
            return;
        }

        // 2. Translation Feature
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

        // 3. Automatic Moderation Filter (Bad words & Links, allowing GIFs/Tenor/Giphy)
        const badWords = ['parolaccia1', 'parolaccia2'];
        const contentLower = message.content.toLowerCase();
        const hasBadWord = badWords.some(word => contentLower.includes(word));
        
        const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|www\.[^\s]+)/i;
        
        // Allow GIFs and media links (Tenor, Giphy, Discord attachments)
        const isGifOrMedia = /(tenor\.com|giphy\.com|discordapp\.com|discord\.com\/attachments|\.(png|jpg|jpeg|gif|webp))\b/i.test(message.content);
        
        const hasLink = linkRegex.test(message.content) && !isGifOrMedia;

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
    },
};
