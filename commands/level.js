/**
 * /level — show a member's real level, XP and rank.
 *
 * Fixes vs. the original:
 *  • It used to return a HARDCODED string ("⭐ Status: Active in chat & GTA LFG!")
 *    with no XP and no level at all — the data existed nowhere readable.
 *  • The XP source (events/levelSystem.js) kept everything in an in-memory Map
 *    that was wiped on every restart. Both are now persisted via lib/data.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const data = require('../lib/data');
const config = require('../lib/config');

/** Simple ASCII progress bar. */
function bar(current, required, width = 14) {
    if (!required) return '▰'.repeat(width);
    const filled = Math.max(0, Math.min(width, Math.round((current / required) * width)));
    return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Check your level, XP and rank in this server')
        .addUserOption((option) => option
            .setName('user')
            .setDescription('Check another member')
            .setRequired(false)),

    category: 'General',

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        if (targetUser.bot) {
            return interaction.reply({ content: '🤖 Bots do not earn XP.', ephemeral: true });
        }

        const { level, xp } = data.getLevel(targetUser.id);
        const required = data.xpForLevel(level);
        const position = data.rank(targetUser.id);
        const balance = data.getBalance(targetUser.id);

        const suffix = (n) => {
            const rem10 = n % 10;
            const rem100 = n % 100;
            if (rem10 === 1 && rem100 !== 11) return 'st';
            if (rem10 === 2 && rem100 !== 12) return 'nd';
            if (rem10 === 3 && rem100 !== 13) return 'rd';
            return 'th';
        };

        const embed = new EmbedBuilder()
            .setColor('#00FF7F')
            .setTitle('📊 Level & Rank')
            .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 128 }))
            .setDescription(
                `${targetUser}\n`
                + `${bar(xp, required)}\n`
                + `**${xp.toLocaleString('en-US')} / ${required.toLocaleString('en-US')} XP** to level ${level + 1}`,
            )
            .addFields(
                { name: 'Level', value: `**${level}**`, inline: true },
                { name: 'Rank', value: `**${position}${suffix(position)}**`, inline: true },
                { name: 'Coins', value: `**${balance.toLocaleString('en-US')}**`, inline: true },
            )
            .setFooter({ text: `+${config.levels.xpPerMessage} XP per message, ${Math.round(config.levels.xpCooldownMs / 1000)}s cooldown` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
