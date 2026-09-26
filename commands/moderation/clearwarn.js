const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearwarn')
        .setDescription('Clear warnings for a user')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user whose warnings you want to clear')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('warn_id')
                .setDescription('The specific warning ID to remove (Leave blank to clear all)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers), // Requires moderation permissions

    category: 'Moderation',

    async execute(interaction) {
        try {
            const target = interaction.options.getUser('target');
            const warnId = interaction.options.getInteger('warn_id');

            // Access global/client autoWarnings map initialized in index.js
            const userWarnings = interaction.client.autoWarnings;

            if (!userWarnings || !userWarnings.has(target.id) || userWarnings.get(target.id).length === 0) {
                return interaction.reply({
                    content: `⚠️ **${target.tag}** has no active warnings to clear.`,
                    ephemeral: true
                });
            }

            let warningsList = userWarnings.get(target.id);

            if (warnId !== null) {
                // Clear a specific warning by index/ID
                if (warnId < 1 || warnId > warningsList.length) {
                    return interaction.reply({
                        content: `❌ Invalid warning ID! **${target.tag}** has warnings numbered between ` + `1 and ${warningsList.length}.`,
                        ephemeral: true
                    });
                }

                // Remove the specific warning
                const removed = warningsList.splice(warnId - 1, 1);
                userWarnings.set(target.id, warningsList);

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🛡️ Warning Cleared')
                    .setDescription(`Successfully removed warning **#${warnId}** from **${target.tag}**.\n\n` +
                        `🗑️ **Removed Reason:** ${removed[0].reason || 'No reason provided'}`)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });

            } else {
                // Clear all warnings for the user
                userWarnings.delete(target.id);

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🛡️ All Warnings Cleared')
                    .setDescription(`Successfully cleared **all** warnings for **${target.tag}**.`)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in clearwarn command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: '❌ An error occurred while executing the clearwarn command.',
                    ephemeral: true
                });
            }
        }
    },
};
