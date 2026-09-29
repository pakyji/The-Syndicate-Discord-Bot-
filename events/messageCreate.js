const axios = require('axios');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const TRANSLATION_CHANNEL_ID = '1538595475794563167';

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // Translation Feature (Only active in the translation channel)
        if (message.channel.id === TRANSLATION_CHANNEL_ID) {
            try {
                const encodedText = encodeURIComponent(message.content);
                const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodedText}&langpair=autodetect|en`);
                const translatedText = response.data.responseData.translatedText;

                if (translatedText && translatedText.toLowerCase() !== message.content.toLowerCase()) {
                    await message.channel.send(`💬 **${message.author.username}:** ${translatedText}`);
                    await message.delete().catch(() => {});
                }
            } catch (error) {
                console.error('Translation error:', error);
            }
            return;
        }

        // All other channels are fully open: links, images, GIFs, bad words, and mentions are now completely unrestricted.
    },
};
