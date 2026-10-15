/**
 * /clear — bulk delete messages.
 *
 * Original problems:
 *  • Legacy `{name, execute}` format, so index.js registered it with
 *    `options: []` — the `amount` argument never existed and the code always
 *    fell through to a hardcoded `bulkDelete(5)`.
 *  • No `setDefaultMemberPermissions` and no in-execute check, so ANY member
 *    could purge messages.
 *  • Errors were swallowed with `.catch(() => {})` and it still replied
 *    "Cleared N messages" even when nothing was deleted.
 *
 * Now: proper slash command, ManageMessages-gated (registration + runtime),
 * amount clamped to Discord's 1..100 bulk-delete limit, and the reply reports
 * how many messages were ACTUALLY removed.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const perms = require('../lib/perms');

const MAX_BULK = 100;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete recent messages from this channel')
        .addIntegerOption((option) => option
            .setName('amount')
            .setDescription(`How many messages to delete (1-${MAX_BULK})`)
            .setMinValue(1)
            .setMaxValue(MAX_BULK)
            .setRequired(false))
        .addUserOption((option) => option
            .setName('user')
            .setDescription('Only delete messages from this user')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageMessages))) return;

        // The bot itself needs the permission too.
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: '❌ I am missing the **Manage Messages** permission in this channel.',
                ephemeral: true,
            });
        }

        const amount = Math.min(Math.max(interaction.options.getInteger('amount') ?? 5, 1), MAX_BULK);
        const filterUser = interaction.options.getUser('user');

        await interaction.deferReply({ ephemeral: true });

        try {
            let deleted;
            if (filterUser) {
                // bulkDelete cannot filter by author, so fetch then delete.
                const fetched = await interaction.channel.messages.fetch({ limit: MAX_BULK });
                const cutoff = Date.now() - TWO_WEEKS_MS;
                const targets = fetched
                    .filter((m) => m.author.id === filterUser.id && m.createdTimestamp > cutoff && !m.system)
                    .first(amount);
                deleted = targets.length;
                if (targets.length) await interaction.channel.bulkDelete(targets, true);
            } else {
                const collection = await interaction.channel.bulkDelete(amount, true);
                deleted = collection.size;
            }

            const note = deleted === 0
                ? 'ℹ️ Nothing to delete (messages older than 14 days cannot be bulk-deleted).'
                : `🧹 Deleted **${deleted}** message(s)${filterUser ? ` from ${filterUser}` : ''}.`;

            await interaction.editReply({ content: note });
        } catch (error) {
            console.error('[clear] failed:', error.message);
            await interaction.editReply({
                content: '❌ Could not delete messages. Check that I have **Manage Messages** and **View Channel** here.',
            });
        }
    },
};
