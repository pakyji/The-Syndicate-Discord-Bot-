/**
 * /gtsos — post the GTA SOS & LFG menu button.
 *
 * Fixes vs. the original:
 *  • Target channel was hardcoded to '902047746624749588' (which is actually the
 *    ERROR LOG channel in config), so the LFG button was being posted into the
 *    staff error log. Now configurable and defaults to the main LFG channel.
 *  • No permission check and no reply on the "channel not found" path when the
 *    interaction had already been answered.
 *  • Now checks the bot can actually send in the target channel.
 */
const {
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const perms = require('../../lib/perms');
const config = require('../../lib/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gtsos')
        .setDescription('Send the GTA SOS & LFG interactive menu button')
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Where to post it (defaults to the configured LFG channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

    category: 'Utility',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageMessages))) return;

        const requested = interaction.options.getChannel('channel');
        const targetId = requested ? requested.id : config.channels.lfgMain;

        const targetChannel = interaction.guild.channels.cache.get(targetId)
            || await interaction.guild.channels.fetch(targetId).catch(() => null);

        if (!targetChannel || !targetChannel.isTextBased()) {
            return interaction.reply({
                content: '❌ Target channel not found. Set `MAIN_LFG_CHANNEL_ID` in `.env` or pass the `channel` option.',
                ephemeral: true,
            });
        }

        const me = interaction.guild.members.me;
        if (!targetChannel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
            return interaction.reply({ content: `❌ I cannot send messages in ${targetChannel}.`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#FF4500')
            .setTitle('🚨 GTA Online SOS & LFG Center')
            .setDescription(
                'Need help with heists, setups, or finding a crew?\n'
                + 'Click the button below to open the GTA menu and find players instantly!',
            )
            .setFooter({ text: 'GTA V Community Support' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('gta_sos_start')
                .setLabel('🎮 Open GTA SOS Menu')
                .setStyle(ButtonStyle.Danger),
        );

        try {
            await targetChannel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('[gtsos] failed to post:', error.message);
            return interaction.reply({ content: '❌ Failed to post the menu.', ephemeral: true });
        }

        return interaction.reply({
            content: `✅ GTA SOS button posted in ${targetChannel}.`,
            ephemeral: true,
        });
    },
};
