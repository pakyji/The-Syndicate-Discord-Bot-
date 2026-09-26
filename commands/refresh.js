const { SlashCommandBuilder, PermissionFlagsBits, REST, Routes } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('refresh')
        .setDescription('Force refresh and clear duplicate or ghost slash commands in this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Collect unique commands from the client collection to prevent duplicates
            const uniqueCommands = [];
            const registeredNames = new Set();

            client.commands.forEach((cmd) => {
                const commandData = cmd.data ? cmd.data.toJSON() : cmd;
                const commandName = cmd.data ? cmd.data.name : cmd.name;

                // Skip invalid or undefined command names
                if (commandName && commandName !== 'undefined' && !registeredNames.has(commandName)) {
                    registeredNames.add(commandName);
                    uniqueCommands.push({
                        name: commandName,
                        description: commandData.description || 'No description provided',
                        options: commandData.options || []
                    });
                }
            });

            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
            const guildId = interaction.guild.id;

            // Overwrite guild commands with the clean unique array (this wipes old/duplicate cached entries)
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: uniqueCommands },
            );

            await interaction.editReply(`✅ Successfully cleaned up and re-registered **${uniqueCommands.length}** clean, unique commands! Duplicate and ghost commands have been wiped.`);
        } catch (error) {
            console.error('Refresh command error:', error);
            await interaction.editReply(`❌ Failed to refresh commands: ${error.message}`);
        }
    },
};
