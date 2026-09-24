const { EmbedBuilder } = require('discord.js');

// Jahan aap bot detection ya raid alerts mangwana chahte hain us channel ki ID
const ALERT_CHANNEL_ID = '902047746624749588';

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        // Agar message bot ka hai ya server ke bahar ka hai toh ignore karein
        if (!message.guild || message.author.bot) return;

        // 1. Suspicious Bot / Webhook / Unverified Bot Message Check
        // Agar user ka account bot hai lekin official verified bot nahi hai ya suspicious activity lag rahi hai
        if (message.author.bot) {
            // Aap yahan chahe toh kuch specific conditions laga sakte hain
        }

        // 2. Rapid Spam / Raid Detector (Ek user ka bar-bar jaldi message bhejna)
        // Hum yahan simple check rakh sakte hain ki agar koi mass-mention ya suspicious spam link bhej raha hai
        const content = message.content;
        
        // Mass mention detection (@everyone ya @here spam)
        if (message.mentions.everyone) {
            try {
                await message.delete();
                
                const warningMsg = await message.channel.send({
                    content: `⚠️ <@${message.author.id}>, `@everyone` or `@here` mentions are restricted to prevent raids!`
                });
                setTimeout(() => warningMsg.delete().catch(() => {}), 5000);

                const alertChannel = message.guild.channels.cache.get(ALERT_CHANNEL_ID);
                if (alertChannel) {
                    const raidEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🚨 Raid / Mass Mention Alert')
                        .setDescription(`**User:** <@${message.author.id}>\n**Channel:** <#${message.channel.id}>\n**Action:** Tried using `@everyone` / `@here`. Message deleted.`)
                        .setTimestamp();

                    await alertChannel.send({ embeds: [raidEmbed] });
                }
            } catch (err) {
                console.error('Raid detector error:', err);
            }
        }
    },
};
