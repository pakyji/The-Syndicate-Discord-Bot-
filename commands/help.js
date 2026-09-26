const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'help',
    category: 'General',
    description: 'Show all commands',
    async execute(interaction) {
        try {
            const client = interaction.client;
            if (!client || !client.commands) {
                return interaction.reply({ content: '❌ Commands collection not found!', ephemeral: true });
            }

            const categories = {};
            // Use a Set to prevent duplicate commands from showing up in the embed
            const processedCommands = new Set();

            client.commands.forEach(cmd => {
                // Support both SlashCommandBuilder (.data.name) and legacy (.name) formats
                const commandName = cmd.data ? cmd.data.name : cmd.name;
                const commandDesc = cmd.data ? cmd.data.description : (cmd.description || 'No description');
                const cat = cmd.category || 'General';

                if (commandName && !processedCommands.has(commandName)) {
                    processedCommands.add(commandName);
                    if (!categories[cat]) categories[cat] = [];
                    categories[cat].push(`\`/${commandName}\` - ${commandDesc}`);
                }
            });

            const embed = new EmbedBuilder()
                .setColor(0x2f3136)
                .setTitle('The Syndicate • Commands')
                .setTimestamp();

            // Populate categories dynamically into fields
            for (const [cat, cmds] of Object.entries(categories)) {
                if (cmds.length > 0) {
                    embed.addFields({ name: cat, value: cmds.join('\n'), inline: false });
                }
            }

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in help command:', error);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '❌ An error occurred while executing the help command.', ephemeral: true });
            }
        }
    },
};
