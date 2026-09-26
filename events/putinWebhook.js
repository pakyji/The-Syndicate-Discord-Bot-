const { Events, WebhookClient } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');

const TARGET_CHANNEL_ID = '1536500109154451618';

// Webhook configuration
const webhookClient = new WebhookClient({ 
    url: 'https://discord.com/api/webhooks/1553455616851185757/-ewfr1--4bpIjrBS5so7hHXr0k4Kc9dNYiSzYVkMSurldv3hrRDTNoUh-y3JrLN3tM06' 
});

// Using your panel's GEMINI_API_KEY variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (message.channel.id !== TARGET_CHANNEL_ID) return;

        const isMentioned = message.mentions.has(message.client.user);
        const hasKeyword = message.content.toLowerCase().includes('putin');

        if (isMentioned || hasKeyword) {
            let userText = message.content
                .replace(/<@!?[0-9>]+/g, '')
                .replace(/@vladimir/gi, '')
                .replace(/putin/gi, '')
                .trim();

            if (!userText) {
                userText = "Hello";
            }

            try {
                // Generate a real AI response acting strictly as Vladimir Putin
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: userText,
                    config: {
                        systemInstruction: "You are Vladimir Putin. Respond dynamically, intelligently, and strictly in character with a sharp, calculating, and authoritative tone. Keep responses concise and impactful for a Discord chat."
                    }
                });

                const aiReply = response.text || "State your business clearly.";

                // Send via Webhook
                await webhookClient.send({
                    content: `🇷🇺 **Vladimir Putin:** ${aiReply}`
                });
            } catch (error) {
                console.error('Error generating AI response:', error);
                await webhookClient.send({
                    content: `🇷🇺 **Vladimir Putin:** Technical difficulties are being addressed.`
                });
            }
        }
    },
};
