const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create an official native poll')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The question for the poll')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('First option')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Second option')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const opt1 = interaction.options.getString('option1');
        const opt2 = interaction.options.getString('option2');

        // Ephemeral reply taaki command execution confirm ho jaye
        await interaction.reply({ content: 'Creating your poll...', ephemeral: true });

        // Discord ka native poll send karega jo screen par interactive dikhega
        await interaction.channel.send({
            poll: {
                question: { text: question },
                answers: [
                    { text: opt1 },
                    { text: opt2 }
                ],
                allowMultiselect: false,
                duration: 24 // Poll active duration in hours (e.g., 24 hours)
            }
        });
    },
};
