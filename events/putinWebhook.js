const { Events } = require('discord.js');
const { WebhookClient } = require('discord.js');

const TARGET_CHANNEL_ID = '1536500109154451618';

// Configured Webhook Client with your URL
const webhookClient = new WebhookClient({ 
    url: 'https://discord.com/api/webhooks/1553455616851185757/-ewfr1--4bpIjrBS5so7hHXr0k4Kc9dNYiSzYVkMSurldv3hrRDTNoUh-y3JrLN3tM06' 
});

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignore bot messages and direct messages
        if (message.author.bot || !message.guild) return;

        // Check if the message is in the target channel
        if (message.channel.id !== TARGET_CHANNEL_ID) return;

        // Check if the bot was mentioned OR if 'putin' was typed
        const isMentioned = message.mentions.has(message.client.user);
        const hasKeyword = message.content.toLowerCase().includes('putin');

        if (isMentioned || hasKeyword) {
            const userText = message.content.replace(/<@!?[0-9>]+/g, '').trim().toLowerCase();
            let aiResponse = "";

            // Dynamic AI-like response logic based on user input
            if (userText.includes('hi') || userText.includes('hello') || userText.includes('hey')) {
                aiResponse = "Greetings. State your business clearly and concisely.";
            } else if (userText.includes('how are you')) {
                aiResponse = "The state of affairs is strong, stable, and completely under control.";
            } else if (userText.includes('economy') || userText.includes('money') || userText.includes('coins')) {
                aiResponse = "Our financial strategy is unshakeable. Focus on productivity and resource management.";
            } else if (userText.includes('game') || userText.includes('play')) {
                aiResponse = "Every game requires precise calculation, discipline, and no hesitation.";
            } else if (userText.length > 5) {
                // Dynamic contextual response for longer questions/statements
                aiResponse = `We have analyzed your statement regarding "${userText}". Our experts are reviewing all implications.`;
            } else {
                aiResponse = "Speak with purpose. What is your strategic objective?";
            }

            try {
                // Send message using the separate Webhook profile dynamically
                await webhookClient.send({
                    content: `🇷🇺 **Vladimir Putin:** ${aiResponse}`
                });
            } catch (error) {
                console.error('Error sending webhook message:', error);
            }
        }
    },
};
