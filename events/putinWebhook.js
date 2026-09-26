const { Events, WebhookClient } = require('discord.js');

const TARGET_CHANNEL_ID = '1536500109154451618';

const webhookClient = new WebhookClient({ 
    url: 'https://discord.com/api/webhooks/1553455616851185757/-ewfr1--4bpIjrBS5so7hHXr0k4Kc9dNYiSzYVkMSurldv3hrRDTNoUh-y3JrLN3tM06' 
});

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
                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) throw new Error("GEMINI_API_KEY mancante nel pannello.");

                // Chiamata diretta via fetch all'API di Gemini (evita problemi di autenticazione del pacchetto)
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                
                const apiResponse = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: userText }]
                        }],
                        systemInstruction: {
                            parts: [{ text: "You are Vladimir Putin. Respond dynamically, intelligently, and strictly in character with a sharp, calculating, and authoritative tone. Keep responses concise and impactful for a Discord chat." }]
                        }
                    })
                });

                const data = await apiResponse.json();
                
                if (data.error) {
                    throw new Error(data.error.message);
                }

                const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "State your business clearly.";

                await webhookClient.send({
                    content: `🇷🇺 **Vladimir Putin:** ${aiReply}`
                });
            } catch (error) {
                console.error('Errore Gemini:', error);
                await webhookClient.send({
                    content: `🇷🇺 **Vladimir Putin (Debug):** ${error.message}`
                });
            }
        }
    },
};
