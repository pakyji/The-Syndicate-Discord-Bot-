const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const perms = require('../lib/perms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from the server using their User ID.')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('The ID of the user you want to unban')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false),
    category: 'Moderation',


    async execute(interaction) {

        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.BanMembers))) return;
        const userId = interaction.options.getString('userid').trim();

        // A Discord snowflake is 17-20 digits. Anything else can never unban.
        const isSnowflake = /^\d{17,20}$/.test(userId);
        if (!isSnowflake) {
            return await interaction.reply({
                content: `❌ \`${userId.slice(0, 40)}\` is not a valid User ID. IDs are 17-20 digits — enable Developer Mode and use "Copy User ID".`,
                ephemeral: true,
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
            return await interaction.reply({ content: '❌ I am missing the **Ban Members** permission.', ephemeral: true });
        }

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
