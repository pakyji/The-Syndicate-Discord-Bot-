const { Events } = require('discord.js');
const { WebhookClient } = require('discord.js');

// Nayi Target Channel ID yahan update kar di gayi hai
const TARGET_CHANNEL_ID = '1536500109154451618';

const webhookClient = new WebhookClient({ 
    url: 'https://discord.com/api/webhooks/1553455616851185757/-ewfr1--4bpIjrBS5so7hHXr0k4Kc9dNYiSzYVkMSurldv3hrRDTNoUh-y3JrLN3tM06' 
});

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;
        
        // Sirf naye target channel par hi check karega
        if (message.channel.id !== TARGET_CHANNEL_ID) return;

        const isMentioned = message.mentions.has(message.client.user);
        const hasKeyword = message.content.toLowerCase().includes('putin');

        if (isMentioned || hasKeyword) {
            let userText = message.content
                .replace(/<@!?[0-9>]+/g, '')
                .replace(/putin/gi, '')
                .trim()
                .toLowerCase();

            let aiResponse = "";

            if (userText.includes('hi') || userText.includes('hello') || userText.includes('hey')) {
                aiResponse = "Greetings. State your business clearly and concisely.";
            } else if (userText.includes('how are you') || userText.includes('kese ho')) {
                aiResponse = "The state of affairs is strong, stable, and completely under control.";
            } else if (userText.includes('what are you doing') || userText.includes('kya kar rahe ho')) {
                aiResponse = "Monitoring global developments and calculating our next strategic moves.";
            } else if (userText.includes('economy') || userText.includes('money') || userText.includes('coins')) {
                aiResponse = "Our financial strategy is unshakeable. Focus on productivity and resource management.";
            } else if (userText.length > 2) {
                aiResponse = `Regarding your query about "${userText}": Our position is firm, and all parameters are being evaluated.`;
            } else {
                aiResponse = "Speak with purpose. What is your strategic objective?";
            }

            try {
                await webhookClient.send({
                    content: `🇷🇺 **Vladimir Putin:** ${aiResponse}`
                });
            } catch (error) {
                console.error('Error sending webhook message:', error);
            }
        }
    },
};
