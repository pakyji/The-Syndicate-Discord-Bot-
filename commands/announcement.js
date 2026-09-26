const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Send a custom announcement to any channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The text channel where the announcement will be sent')
                .addChannelTypes(ChannelType.GuildText) // Restricts selection to text channels only
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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Restricted to Administrators

    category: 'Utility',

    async execute(interaction) {
        try {
            const targetChannel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title');
            const message = interaction.options.getString('message');
            const pingOption = interaction.options.getString('ping') || 'none';

            // Check if the bot has permission to send messages in that target channel
            const botMember = interaction.guild.members.cache.get(interaction.client.user.id) || await interaction.guild.members.fetch(interaction.client.user.id);
            if (!targetChannel.permissionsFor(botMember).has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
                return interaction.reply({
                    content: `❌ I do not have permission to view, send messages, or embed links in ${targetChannel}!`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0xFF4500) // Vibrant orange-red for announcements
                .setTitle(`📢 ${title}`)
                .setDescription(message)
                .setFooter({ text: `Announcement by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            // Format ping text if chosen
            let pingContent = '';
            if (pingOption === '@everyone') pingContent = '@everyone';
            if (pingOption === '@here') pingContent = '@here';

            // Send the announcement to the target channel
            await targetChannel.send({
                content: pingContent ? pingContent : undefined,
                embeds: [embed],
                allowedMentions: { parse: ['everyone', 'here', 'roles'] }
            });

            // Confirm back to the admin privately
            return interaction.reply({
                content: `✅ Successfully sent the announcement to ${targetChannel}!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in announcement command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: '❌ An error occurred while executing the announcement command.',
                    ephemeral: true
                });
            }
        }
    },
};
