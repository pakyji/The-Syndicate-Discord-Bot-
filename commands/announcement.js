const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Send a custom announcement to any channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The text channel where the announcement will be sent')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The title of the announcement')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The main text/content of the announcement')
                .setRequired(true))
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
            const targetChannel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title');
            const message = interaction.options.getString('message');
            const pingOption = interaction.options.getString('ping') || 'none';

            const embed = new EmbedBuilder()
                .setColor(0xFF4500)
                .setTitle(`📢 ${title}`)
                .setDescription(message)
                .setFooter({ text: `Announcement by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            let pingContent = '';
            if (pingOption === '@everyone') pingContent = '@everyone';
            if (pingOption === '@here') pingContent = '@here';

            // Send message directly to the target channel
            await targetChannel.send({
                content: pingContent ? pingContent : undefined,
                embeds: [embed],
                allowedMentions: { parse: ['everyone', 'here', 'roles'] }
            });

            return interaction.reply({
                content: `✅ Successfully sent the announcement to ${targetChannel}!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in announcement command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: '❌ An error occurred while executing the announcement command. Make sure I have permission to send messages in that channel.',
                    ephemeral: true
                });
            }
        }
    },
};
