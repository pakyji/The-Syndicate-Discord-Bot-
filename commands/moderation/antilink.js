const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const storagePath = path.join(__dirname, 'securityStorage.json');

function loadData() {
    if (!fs.existsSync(storagePath)) {
        fs.writeFileSync(storagePath, JSON.stringify({ antiLinkStatus: true, antiBadWordsStatus: true, customBlockedLinks: [], customBadWords: [] }, null, 4));
    }
    return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 4));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antilink')
        .setDescription('Manage anti-link protection and custom blocked links.')
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
                .setDescription('Add a custom domain or link to the blocklist.')
                .addStringOption(option =>
                    option.setName('domain')
                        .setDescription('The domain or link to block (e.g., scamlink.com)')
                        .setRequired(true))),

    async execute(interaction) {
        // Prevent "The application did not respond" timeout error
        await interaction.deferReply({ ephemeral: true });

        const data = loadData();
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'toggle') {
            const status = interaction.options.getString('status');
            data.antiLinkStatus = (status === 'on');
            saveData(data);

            const embed = new EmbedBuilder()
                .setColor(data.antiLinkStatus ? 0x00FF00 : 0xFF0000)
                .setTitle('🛡️ Anti-Link Status Updated')
                .setDescription(`Anti-link protection has been turned **${status.toUpperCase()}**.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'add') {
            const domain = interaction.options.getString('domain').toLowerCase().trim();
            
            if (data.customBlockedLinks.includes(domain)) {
                return await interaction.editReply({ content: `⚠️️ \`${domain}\` is already in the blocked list.` });
            }

            data.customBlockedLinks.push(domain);
            saveData(data);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🛡️ Custom Link Blocked')
                .setDescription(`Successfully added \`${domain}\` to your custom anti-link blocklist.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
