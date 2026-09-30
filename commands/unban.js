const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from the server using their User ID.')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('The ID of the user you want to unban')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        const userId = interaction.options.getString('userid');

        try {
            // Esegue l'unban dell'utente tramite il suo ID
            await interaction.guild.members.unban(userId);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ User Unbanned')
                .setDescription(`Successfully unbanned the user with ID: \`${userId}\``)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: '❌ Failed to unban the user. Make sure the User ID is correct and that the user is actually banned.',
                ephemeral: true
            });
        }
    },
};
