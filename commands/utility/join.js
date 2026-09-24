const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = {
    name: 'join',
    description: 'Fa entrare il bot nel tuo canale vocale',
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Fa entrare il bot nel tuo canale vocale'),
    async execute(interactionOrMessage, args) {
        // Supporto sia per Slash Command che per comando testuale (!join)
        const isInteraction = interactionOrMessage.isChatInputCommand?.() || false;
        const member = interactionOrMessage.member;
        const guild = interactionOrMessage.guild;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {
            const replyText = '❌ Devi prima entrare in un canale vocale!';
            if (isInteraction) {
                return await interactionOrMessage.reply({ content: replyText, ephemeral: true });
            } else {
                return await interactionOrMessage.reply(replyText);
            }
        }

        try {
            joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true,
            });

            const successText = `✅ Sono entrato nel canale vocale: **${voiceChannel.name}**!`;
            if (isInteraction) {
                await interactionOrMessage.reply({ content: successText, ephemeral: true });
            } else {
                await interaction.reply(successText);
            }
        } catch (error) {
            console.error('Join command error:', error);
            const errorText = '❌ Non sono riuscito a entrare nel canale vocale.';
            if (isInteraction) {
                await interactionOrMessage.reply({ content: errorText, ephemeral: true });
            } else {
                await interactionOrMessage.reply(errorText);
            }
        }
    }
};
