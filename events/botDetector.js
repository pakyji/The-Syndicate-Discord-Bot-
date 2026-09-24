const { EmbedBuilder } = require('discord.js');

const ALERT_CHANNEL_ID = '902047746624749588';

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (!message.guild || message.author.bot) return;

        // Mass mention detection (@everyone ya @here spam)
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
        }
    },
};
