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
        .setName('antibadwords')
        .setDescription('Manage bad words filter and custom blocked words.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Turn bad words filter on or off.')
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
                .setDescription('Add a custom bad word to the filter.')
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('The word you want to block')
                        .setRequired(true))),

    async execute(interaction) {
        const data = loadData();
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'toggle') {
            const status = interaction.options.getString('status');
            data.antiBadWordsStatus = (status === 'on');
            saveData(data);

            const embed = new EmbedBuilder()
                .setColor(data.antiBadWordsStatus ? 0x00FF00 : 0xFF0000)
                .setTitle('🛡️ Bad Words Filter Status Updated')
                .setDescription(`Bad words filter has been turned **${status.toUpperCase()}**.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'add') {
            const word = interaction.options.getString('word').toLowerCase().trim();

            if (data.customBadWords.includes(word)) {
                return await interaction.reply({ content: `⚠️ The word \`${word}\` is already in the filter list.`, ephemeral: true });
            }

            data.customBadWords.push(word);
            saveData(data);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🛡️️ Custom Bad Word Added')
                .setDescription(`Successfully added \`${word}\` to your prohibited words list.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
