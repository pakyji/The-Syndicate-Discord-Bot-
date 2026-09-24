const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'warn',
    description: 'Warn a user for breaking rules',
    options: [
        {
            name: 'user',
            type: 6, // USER type
            description: 'The user you want to warn',
            required: true,
        },
        {
            name: 'reason',
            type: 3, // STRING type
            description: 'Reason for the warning',
            required: false,
        },
    ],
    async execute(interaction) {
        // Check permissions (Moderate Members or Administrator)
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return await interaction.reply({ 
                content: '❌ You do not have permission to use this command!', 
                ephemeral: true 
            });
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return await interaction.reply({ 
                content: '❌ Could not find that user in this server.', 
                ephemeral: true 
            });
        }

        // Embed notification
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ User Warned')
            .addFields(
                { name: 'User', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                { name: 'Reason', value: reason }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // DM the warned user
        try {
            await targetUser.send(`⚠️ You have been warned in **${interaction.guild.name}** for: **${reason}**`);
        } catch (err) {
            // User might have DMs closed
        }
    },
};
