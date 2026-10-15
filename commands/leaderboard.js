/**
 * /leaderboard — richest members.
 *
 * Fixes vs. the original:
 *  • Unified store instead of the CWD-relative `./coins.json` (see balance.js).
 *  • The original sorted `b[1] - a[1]` on raw JSON values with no numeric
 *    coercion, so a non-numeric entry produced NaN and silently scrambled the
 *    ordering.
 *  • Users who have left the server are now filtered out instead of showing as
 *    unresolvable IDs.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const data = require('../lib/data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the richest members'),

    category: 'Economy',

    async execute(interaction) {
        await interaction.deferReply();

        const rows = data.leaderboard(20);
        if (!rows.length) {
            return interaction.editReply({ content: '🪙 Nobody has earned any coins yet!' });
        }

        // Resolve names, skipping members no longer in the guild.
        const lines = [];
        const medals = ['🥇', '🥈', '🥉'];

        for (let i = 0; i < rows.length && lines.length < 10; i += 1) {
            const row = rows[i];
            const member = await interaction.guild.members.fetch(row.id).catch(() => null);
            if (!member || member.user.bot) continue;

            const prefix = medals[lines.length] || `**${lines.length + 1}.**`;
            lines.push(`${prefix} ${member.user.username} — \`${row.balance.toLocaleString('en-US')}\` coins · Lv. ${row.level}`);
        }

        if (!lines.length) {
            return interaction.editReply({ content: '🪙 No ranked members are still in the server.' });
        }

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`🏆 ${interaction.guild.name} Coin Leaderboard`)
            .setDescription(lines.join('\n'))
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },
};
