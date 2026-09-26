const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Temporarily timeout/mute a member')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the mute')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    category: 'Moderation',

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getMember('target');
            const durationMinutes = interaction.options.getInteger('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!targetUser) {
                return interaction.reply({ content: '❌ User not found in this server!', ephemeral: true });
            }

            if (!targetUser.moderatable) {
                return interaction.reply({ content: '❌ I cannot mute this user. They might have higher roles than me.', ephemeral: true });
            }

            const durationMs = durationMinutes * 60 * 1000;
            await targetUser.timeout(durationMs, reason);

            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('🔇 Member Muted')
                .setDescription(`**${targetUser.user.tag}** has been muted for **${durationMinutes} minutes**.\n\n📝 **Reason:** ${reason}`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in mute command:', error);
            return interaction.reply({ content: '❌ An error occurred while trying to mute this user.', ephemeral: true });
        }
    },
};
