const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

let antiBadWordsStatus = true;
const customBadWords = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antibadwords')
        .setDescription('Manage the bad words filter.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Turn bad words filter ON or OFF.')
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
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'toggle') {
            const status = interaction.options.getString('status');
            antiBadWordsStatus = (status === 'on');

            const embed = new EmbedBuilder()
                .setColor(antiBadWordsStatus ? 0x00FF00 : 0xFF0000)
                .setTitle('🛡️ Bad Words Filter Status Updated')
                .setDescription(`Bad words filter has been turned **${status.toUpperCase()}**.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'add') {
            const word = interaction.options.getString('word').toLowerCase();
            customBadWords.add(word);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🛡️ Custom Bad Word Added')
                .setDescription(`Successfully added \`${word}\` to the prohibited words list.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
