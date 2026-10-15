/**
 * /jackpot — launch a randomised prize pool event.
 *
 * Fixes vs. the original (all handled by lib/prizeEvent.js):
 *  • `min_coins`, `max_coins` and `duration` had NO bounds at all. Before the
 *    permission fix any member could launch one; even afterwards an admin could
 *    pass a negative range, a 10^15-coin prize, or a duration of 10^9 minutes —
 *    which overflows Node's int32 timer and makes the collector end immediately.
 *  • `addJackpotCoins(winnerId, randomPrize)` was NOT awaited, so the announcement
 *    claimed the coins had been added even when the write failed.
 *  • Bots could enter and win the pool.
 *  • A member who entered and then left could still be drawn.
 *  • Every join re-edited the message, tripping Discord's rate limit.
 *  • No cap on concurrent events, and nothing persisted across a restart.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const perms = require('../lib/perms');
const prizeEvent = require('../lib/prizeEvent');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jackpot')
        .setDescription('Launch a jackpot with a random prize pool')
        .addIntegerOption((option) => option
            .setName('min_coins')
            .setDescription('Minimum coins for the random prize pool')
            .setRequired(true)
            .setMinValue(prizeEvent.LIMITS.minCoins)
            .setMaxValue(prizeEvent.LIMITS.maxPrize))
        .addIntegerOption((option) => option
            .setName('max_coins')
            .setDescription('Maximum coins for the random prize pool')
            .setRequired(true)
            .setMinValue(prizeEvent.LIMITS.minCoins)
            .setMaxValue(prizeEvent.LIMITS.maxPrize))
        .addIntegerOption((option) => option
            .setName('duration')
            .setDescription('How long the jackpot stays open, in minutes')
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
                title: '🎰 THE SYNDICATE • AUTOMATED JACKPOT 🎰',
                blurb: 'A random jackpot has been launched!',
                buttonLabel: 'Join Jackpot',
                emoji: '🎟️',
                color: 0xffd700,
            },
        });

        if (!result.ok) {
            return interaction.editReply({ content: `❌ ${result.error}` });
        }

        return interaction.editReply({
            content: `✅ Jackpot launched — prize pool **${result.prize.toLocaleString('en-US')}** coins, `
                + `open for **${spec.minutes}** minute(s).`,
        });
    },
};
