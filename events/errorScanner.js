const { EmbedBuilder } = require('discord.js');

// Jahan aap error aur upload/system logs mangwana chahte hain us channel ki ID
const LOG_CHANNEL_ID = '902047746624749588'; 

module.exports = {
    name: 'ready',
    async execute(client) {
        console.log(`🛡️ Error & Upload Scanner is active for ${client.user.tag}`);

        // 1. Unhandled Rejections (jaise API request fail hona, MyMemory translation error)
        process.on('unhandledRejection', async (error) => {
            console.error('Unhandled Promise Rejection:', error);
            await sendErrorLog(client, 'Unhandled Rejection / API Error', error);
        });

        // 2. Uncaught Exceptions (jaise code crash hone par)
        process.on('uncaughtException', async (error) => {
            console.error('Uncaught Exception:', error);
            await sendErrorLog(client, 'Uncaught Exception / Crash', error);
        });
    },
};

// Helper function jo error ko embed banakar target channel par bhej dega
async function sendErrorLog(client, errorType, error) {
    try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!logChannel) return;

        const errorMessage = error.stack || error.message || String(error);
        // Discord embed description ki limit 4096 characters hoti hai
        const truncatedMessage = errorMessage.length > 3500 ? errorMessage.substring(0, 3500) + '...' : errorMessage;

        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`🚨 Bot System Error / Upload Alert`)
            .setDescription(`**Type:** \`${errorType}\`\n\n**Details:**\n\`\`\`js\n${truncatedMessage}\n\`\`\``)
            .setTimestamp();

        await logChannel.send({ embeds: [errorEmbed] });
    } catch (err) {
        console.error('Failed to send error log to Discord channel:', err);
    }
}
