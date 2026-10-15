/**
 * /clearwarn — remove one or all warnings for a member.
 *
 * Fixes vs. the original:
 *  • Read/wrote `interaction.client.autoWarnings`, an in-memory Map created in
 *    index.js, so every warning vanished on restart. Now backed by the persisted
 *    store, matching the rewritten /warn.
 *  • No role-hierarchy check — a junior mod could clear the warnings of an admin.
 *  • The invalid-ID branch built its error string with string concatenation
 *    around a template literal, which produced broken output.
 *  • Replies are guarded so a deferred interaction cannot throw on a second reply.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const perms = require('../../lib/perms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearwarn')
        .setDescription("Clear a member's warnings")
        .addUserOption((option) => option
            .setName('target')
            .setDescription('The member whose warnings to clear')
            .setRequired(true))
        .addIntegerOption((option) => option
            .setName('warn_id')
            .setDescription('Specific warning number to remove (blank = clear all)')
            .setMinValue(1)
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ModerateMembers))) return;

        const target = interaction.options.getUser('target');
        const warnId = interaction.options.getInteger('warn_id');

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (member && !perms.canModerate(interaction.member, member)) {
            return interaction.reply({
                content: '❌ You cannot clear the warnings of a member who holds an equal or higher role than you.',
                ephemeral: true,
            });
        }

        const existing = store.getWarnings(target.id);
        if (!existing.length) {
            return interaction.reply({
                content: `⚠️ **${target.username}** has no active warnings.`,
                ephemeral: true,
            });
        }

        /* ── Remove a single warning ─────────────────────────── */
        if (warnId !== null) {
            if (warnId < 1 || warnId > existing.length) {
                return interaction.reply({
                    content: `❌ Invalid warning ID. **${target.username}** has warnings numbered 1 to ${existing.length}.`,
                    ephemeral: true,
                });
            }

            const removed = await store.removeWarning(target.id, warnId);
            if (!removed) {
                return interaction.reply({ content: '❌ That warning no longer exists.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🛡️ Warning Cleared')
                .setDescription(
                    `Removed warning **#${warnId}** from ${target}.\n`
                    + `**Reason was:** ${removed.reason || 'No reason provided'}\n`
                    + `**Remaining:** ${store.getWarnings(target.id).length}`,
                )
                .setFooter({ text: `By ${interaction.user.tag}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        /* ── Clear all ───────────────────────────────────────── */
        const cleared = await store.clearWarnings(target.id);

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🛡️ All Warnings Cleared')
            .setDescription(`Cleared **${cleared}** warning(s) for ${target}.`)
            .setFooter({ text: `By ${interaction.user.tag}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
