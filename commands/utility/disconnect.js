const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    name: 'disconnect',
    description: 'Disconnect the bot from the voice channel',
    data: new SlashCommandBuilder()
        .setName('disconnect')
        .setDescription('Disconnect the bot from the voice channel'),
    
    async execute(interactionOrMessage) {
        const isSlash = interactionOrMessage.isChatInputCommand?.() || false;
        const guild = interactionOrMessage.guild;
        const connection = getVoiceConnection(guild.id);

        if (connection) {
            connection.destroy();
            const reply = '⏹️ Disconnected from the voice channel!';
            if (isSlash) {
                await interactionOrMessage.reply({ content: reply, ephemeral: true });
            } else {
                await interactionOrMessage.reply(reply);
            }
        } else {
            const reply = '❌ The bot is not connected to any voice channel!';
            if (isSlash) {
                await interactionOrMessage.reply({ content: reply, ephemeral: true });
            } else {
                await interactionOrMessage.reply(reply);
            }
        }
    }
};
