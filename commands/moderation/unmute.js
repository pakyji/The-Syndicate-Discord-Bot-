const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout/mute from a member')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to unmute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for unmuting')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    category: 'Moderation',

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getMember('target');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!targetUser) {
                return interaction.reply({ content: '❌ User not found in this server!', ephemeral: true });
            }

            if (!targetUser.isCommunicationDisabled()) {
                return interaction.reply({ content: '⚠️ This user is not currently muted/timed out.', ephemeral: true });
            }

            await targetUser.timeout(null, reason);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🔊 Member Unmuted')
                .setDescription(`Timeout has been removed from **${targetUser.user.tag}**.\n\n📝 **Reason:** ${reason}`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in unmute command:', error);
            return interaction.reply({ content: '❌ An error occurred while trying to unmute this user.', ephemeral: true });
        }
    },
};
