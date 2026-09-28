const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Send a custom announcement to any channel')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The title of the announcement')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The main text/content of the announcement')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The text channel where the announcement will be sent (Optional)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('ping')
                .setDescription('Choose a role ping option')
                .setRequired(false)
                .addChoices(
                    { name: '@everyone', value: '@everyone' },
                    { name: '@here', value: '@here' },
                    { name: 'None (No Ping)', value: 'none' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    category: 'Utility',

    async execute(interaction) {
        try {
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            const title = interaction.options.getString('title');
            const message = interaction.options.getString('message');
            const pingOption = interaction.options.getString('ping') || 'none';

            const embed = new EmbedBuilder()
                .setColor(0xFF4500)
                .setTitle(`📢 ${title}`)
                .setDescription(message)
                .setFooter({ text: `Announcement by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            let contentToSend = undefined;
            if (pingOption === '@everyone') contentToSend = '@everyone';
            if (pingOption === '@here') contentToSend = '@here';

            await targetChannel.send({
                content: contentToSend,
                embeds: [embed],
                allowedMentions: { parse: ['everyone'] }
            });

            return interaction.reply({
                content: `✅ Successfully sent the announcement to ${targetChannel}!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in announcement command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: `❌ An error occurred: ${error.message}`,
                    ephemeral: true
                });
            } else {
                return interaction.followUp({
                    content: `❌ An error occurred: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    },
};
