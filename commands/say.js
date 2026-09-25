const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot send a message for you.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message you want the bot to send')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), // Sirf mods/admins use kar sakte hain

    async execute(interaction) {
        const textToSend = interaction.options.getString('message');

        // Interaction ka reply ephemeral (hidden) bhejenge taaki sirf aapko dikhe
        await interaction.reply({ content: 'Message sent successfully!', ephemeral: true });

        // Bot us channel mein aapka diya hua text khud send kar dega
        await interaction.channel.send(textToSend);
    },
};
