const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    name: 'giveaway',
    description: 'Open a setup form to launch a secure giveaway',
    default_member_permissions: PermissionFlagsBits.Administrator,
    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('secure_giveaway_modal')
            .setTitle('🎉 Secure Giveaway Setup');

        const prizeInput = new TextInputBuilder()
            .setCustomId('gw_prize')
            .setLabel('Prize')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Discord Nitro')
            .setRequired(true);

        const durationInput = new TextInputBuilder()
            .setCustomId('gw_duration')
            .setLabel('Duration (e.g. 10s, 1m, 1h, 1d)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1h')
            .setRequired(true);

        const hostInput = new TextInputBuilder()
            .setCustomId('gw_host')
            .setLabel('Host Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Syndicate Owner')
            .setRequired(true);

        const invitesInput = new TextInputBuilder()
            .setCustomId('gw_min_invites')
            .setLabel('Minimum Invites Required (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 3 (leave blank for 0)')
            .setRequired(false);

        const msgInput = new TextInputBuilder()
            .setCustomId('gw_message')
            .setLabel('Custom Message (Optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Good luck everyone!')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(prizeInput),
            new ActionRowBuilder().addComponents(durationInput),
            new ActionRowBuilder().addComponents(hostInput),
            new ActionRowBuilder().addComponents(invitesInput),
            new ActionRowBuilder().addComponents(msgInput)
        );

        await interaction.showModal(modal);
    },
};
