const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Ricarica i comandi del bot')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Il nome del comando da ricaricare')
                .setRequired(true)),

    async execute(interaction) {
        const commandName = interaction.options.getString('command').toLowerCase();
        const command = interaction.client.commands.get(commandName);

        if (!command) {
            return interaction.reply({ content: `❌ Nessun comando trovato con il nome \`${commandName}\`!`, ephemeral: true });
        }

        try {
            // Path ko dynamic ya relative rakhne ke liye safe tareeqa
            const commandPath = require.resolve(`./${command.data.name}.js`);
            delete require.cache[commandPath];

            const newCommand = require(commandPath);
            interaction.client.commands.set(newCommand.data.name, newCommand);
            await interaction.reply({ content: `✅ Il comando \`${newCommand.data.name}\` è stato ricaricato con successo!`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: `❌ Errore durante il ricaricamento del comando \`${command.data.name}\`:\n\`\`\`${error.message}\`\`\``, ephemeral: true });
        }
    },
};
