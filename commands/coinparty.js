/**
 * /coinparty — launch a coin party event with a random prize.
 *
 * Fixes vs. the original (all handled by lib/prizeEvent.js):
 *  • Unbounded `min_coins` / `max_coins` / `duration`, including negative ranges
 *    and durations that overflow Node's int32 timer.
 *  • `addCoinpartyCoins(...)` was not awaited — the "coins added automatically"
 *    announcement fired even when the balance write failed.
 *  • Bots could enter and win.
 *  • Members who had left the server could still be drawn as the winner.
 *  • The message was edited on every single join (rate-limit risk).
 *  • No cap on concurrent events; nothing persisted across a restart.
 *  • The file was a near-duplicate of jackpot.js — both now share one engine, so a
 *    fix to the prize logic cannot be applied to one and missed in the other.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const perms = require('../lib/perms');
const prizeEvent = require('../lib/prizeEvent');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinparty')
        .setDescription('Launch a coin party event with a random prize pool')
        .addIntegerOption((option) => option
            .setName('min_coins')
            .setDescription('Minimum coins for the random prize')
            .setRequired(true)
            .setMinValue(prizeEvent.LIMITS.minCoins)
            .setMaxValue(prizeEvent.LIMITS.maxPrize))
        .addIntegerOption((option) => option
            .setName('max_coins')
            .setDescription('Maximum coins for the random prize')
            .setRequired(true)
            .setMinValue(prizeEvent.LIMITS.minCoins)
            .setMaxValue(prizeEvent.LIMITS.maxPrize))
        .addIntegerOption((option) => option
            .setName('duration')
            .setDescription('How long the party stays open, in minutes')
            .setRequired(true)
            .setMinValue(prizeEvent.LIMITS.minDurationMinutes)
            .setMaxValue(prizeEvent.LIMITS.maxDurationMinutes))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Economy',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const spec = prizeEvent.validateOptions({
            minCoins: interaction.options.getInteger('min_coins'),
            maxCoins: interaction.options.getInteger('max_coins'),
            durationMinutes: interaction.options.getInteger('duration'),
        });

        if (!spec.ok) {
            return interaction.reply({ content: `❌ ${spec.error}`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const result = await prizeEvent.launch({
            interaction,
            spec,
            theme: {
                title: '🪩 THE SYNDICATE • COIN PARTY 🪩',
                blurb: 'A coin party has been launched — join for a chance to win!',
                buttonLabel: 'Join the Party',
                emoji: '🎉',
                color: 0xff69b4,
            },
        });

        if (!result.ok) {
            return interaction.editReply({ content: `❌ ${result.error}` });
        }

        return interaction.editReply({
            content: `✅ Coin party launched — prize **${result.prize.toLocaleString('en-US')}** coins, `
                + `open for **${spec.minutes}** minute(s).`,
        });
    },
};
