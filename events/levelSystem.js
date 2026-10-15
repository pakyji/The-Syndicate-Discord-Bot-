/**
 * XP / levelling.
 *
 * Fixes vs. the original:
 *  • XP and levels are PERSISTED. The original kept them in a plain in-memory
 *    `Map`, so every restart wiped the entire server's progression — and
 *    `/level` then returned a hardcoded fake string instead of real data.
 *  • Cooldowns use an expiry-timestamp tracker with eviction instead of an
 *    unpruned Map.
 *  • Level-up announcements are optional and rate-limited so a busy channel
 *    cannot be flooded.
 *  • The XP curve is configurable rather than hardcoded to level*100.
 */
const { Events, EmbedBuilder } = require('discord.js');
const data = require('../lib/data');
const config = require('../lib/config');
const { Cooldowns } = require('../lib/cooldowns');

const cooldowns = new Cooldowns(config.levels.xpCooldownMs, 10000);

module.exports = {
    name: Events.MessageCreate,

    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (!message.content || message.content.length < 2) return;
        if (message.system) return;

        const userId = message.author.id;
        if (!cooldowns.take(userId)) return;

        const result = await data.addXp(userId, config.levels.xpPerMessage);
        if (!result || !result.levelledUp) return;
        if (!config.levels.announceLevelUps) return;

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setDescription(
                `🎉 Congratulations ${message.author} — you reached **Level ${result.level}**! 🚀`,
            )
            .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(() => {});
    },
};
