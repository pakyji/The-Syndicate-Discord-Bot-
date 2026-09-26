const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a member from the server')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The member to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        // Check if member exists in the server
        if (!member) {
            return await interaction.reply({ content: '❌ That user is not in this server or could not be found.', ephemeral: true });
        }

        // Check if bot can ban the user (role hierarchy check)
        if (!member.bannable) {
            return await interaction.reply({ content: '❌ I cannot ban this user. Their role might be higher than mine or they have administrator permissions.', ephemeral: true });
        }

        try {
            // Ban the user
            await interaction.guild.members.ban(targetUser, { reason: reason });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔨 Member Banned')
                .addFields(
                    { name: 'Banned User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: 'Banned By', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason, false: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error banning user:', error);
            await interaction.reply({ content: '❌ An error occurred while trying to ban this user.', ephemeral: true });
        }
    },
};
