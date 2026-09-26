const { Events } = require('discord.js');
const { WebhookClient } = require('discord.js');

const TARGET_CHANNEL_ID = '899366913086455828';

// Configured Webhook Client with your URL
const webhookClient = new WebhookClient({ 
    url: 'https://discord.com/api/webhooks/1553455616851185757/-ewfr1--4bpIjrBS5so7hHXr0k4Kc9dNYiSzYVkMSurldv3hrRDTNoUh-y3JrLN3tM06' 
});

const putinResponses = [
    "That is a very interesting perspective. We are monitoring the situation closely.",
    "Strength and discipline are the foundation of any successful operation.",
    "Sanctions or no sanctions, our objective remains crystal clear.",
    "Let us look at the long-term strategy, not just temporary distractions.",
    "History will be the ultimate judge of our actions today.",
    "A leader must always remain calm, calculate every move, and act decisively."
];

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
            const randomResponse = putinResponses[Math.floor(Math.random() * putinResponses.length)];

            try {
                // Send message using the separate Webhook profile
                await webhookClient.send({
                    content: `🇷🇺 **Vladimir Putin:** ${randomResponse} (Responding to <@${message.author.id}>)`
                });
            } catch (error) {
                console.error('Error sending webhook message:', error);
            }
        }
    },
};
