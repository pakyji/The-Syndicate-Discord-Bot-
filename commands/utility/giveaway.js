/**
 * /giveaway — open the giveaway setup form.
 * Converted to SlashCommandBuilder so the Administrator gate is actually
 * registered with Discord. Duration parsing is validated here too, because the
 * original accepted any free-text string and passed it straight to a timer.
 *
 * The parser itself lives in lib/duration.js: it was duplicated here and in
 * events/interactionCreate.js, and the copy exported from this file was never
 * called by anything.
 */
const {
    SlashCommandBuilder, PermissionFlagsBits, ModalBuilder,
    TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const perms = require('../../lib/perms');
const { GIVEAWAY_LIMITS, describeDurationLimits } = require('../../lib/duration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Open a setup form to launch a giveaway')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Admin',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const modal = new ModalBuilder()
            .setCustomId('secure_giveaway_modal')
            .setTitle('🎉 Giveaway Setup');

        const prizeInput = new TextInputBuilder()
            .setCustomId('gw_prize')
            .setLabel('Prize')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Discord Nitro')
            .setMaxLength(100)
            .setRequired(true);

        const durationInput = new TextInputBuilder()
            .setCustomId('gw_duration')
            // Label is derived from the shared limits so the two cannot disagree.
            .setLabel(`Duration (${describeDurationLimits(GIVEAWAY_LIMITS)})`)  // <= 45 chars
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1h')
            .setMaxLength(8)
            .setRequired(true);

        const hostInput = new TextInputBuilder()
            .setCustomId('gw_host')
            .setLabel('Host name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Syndicate Owner')
            .setMaxLength(50)
            .setRequired(true);

        const invitesInput = new TextInputBuilder()
            .setCustomId('gw_min_invites')
            .setLabel('Minimum invites required (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('3 (leave blank for 0)')
            .setMaxLength(5)
            .setRequired(false);

        const msgInput = new TextInputBuilder()
            .setCustomId('gw_message')
            .setLabel('Custom message (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Good luck everyone!')
            .setMaxLength(1000)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(prizeInput),
            new ActionRowBuilder().addComponents(durationInput),
            new ActionRowBuilder().addComponents(hostInput),
            new ActionRowBuilder().addComponents(invitesInput),
            new ActionRowBuilder().addComponents(msgInput),
        );

        await interaction.showModal(modal);
    },
};
