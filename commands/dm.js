const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send a direct message to a user through the bot')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user you want to send the message to')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message content to send')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Restricted to Administrators

    category: 'Moderation',

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('target');
            const messageContent = interaction.options.getString('message');

            // Prevent the bot from trying to message itself or system bots
            if (targetUser.bot) {
                return interaction.reply({
                    content: '❌ You cannot send a direct message to a bot.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x2f3136)
                .setTitle('The Syndicate • Staff Message')
                .setDescription(messageContent)
                .setFooter({ text: `Message sent by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            // Try sending the DM to the user
            try {
                await targetUser.send({ embeds: [embed] });
            } catch (err) {
                return interaction.reply({
                    content: `❌ Could not send a DM to **${targetUser.tag}**. Their direct messages might be closed or they have blocked the bot.`,
                    ephemeral: true
                });
            }

            // Confirm success to the admin
            return interaction.reply({
                content: `✅ Successfully sent a direct message to **${targetUser.tag}**!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in dm command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: '❌ An error occurred while executing the dm command.',
                    ephemeral: true
                });
            }
        }
    },
};
