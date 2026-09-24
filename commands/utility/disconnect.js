const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    name: 'disconnect',
    description: 'Disconnect the bot from the voice channel',
    async execute(interaction) {
        const connection = getVoiceConnection(interaction.guild.id);
        
        if (connection) {
            connection.destroy();
            interaction.client.musicQueues.delete(interaction.guild.id);
            return interaction.reply({ content: '⏹️ Disconnected from the voice channel!', ephemeral: true });
        } else {
            return interaction.reply({ content: '❌ The bot is not connected to any voice channel!', ephemeral: true });
        }
    },
};
