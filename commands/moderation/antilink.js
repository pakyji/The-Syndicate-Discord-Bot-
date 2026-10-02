const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

let antiLinkStatus = true;
const customBlockedLinks = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antilink')
        .setDescription('Manage the anti-link security settings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Turn anti-link protection on or off.')
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('Choose ON or OFF')
                        .setRequired(true)
                        .addChoices(
                            { name: 'On', value: 'on' },
                            { name: 'Off', value: 'off' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a custom link or domain to block.')
                .addStringOption(option =>
                    option.setName('domain')
                        .setDescription('The domain or link to block (e.g., scamlink.com)')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'toggle') {
            const status = interaction.options.getString('status');
            antiLinkStatus = (status === 'on');

            const embed = new EmbedBuilder()
                .setColor(antiLinkStatus ? 0x00FF00 : 0xFF0000)
                .setTitle('🛡️ Anti-Link Status Updated')
                .setDescription(`Anti-link protection has been turned **${status.toUpperCase()}**.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'add') {
            const domain = interaction.options.getString('domain').toLowerCase();
            customBlockedLinks.add(domain);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🛡️ Custom Link Blocked')
                .setDescription(`Successfully added \`${domain}\` to the custom anti-link blocklist.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
