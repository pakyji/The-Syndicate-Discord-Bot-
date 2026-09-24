module.exports = {
    name: 'ping',
    category: 'General',
    description: 'Check bot latency',
    async execute(context, args) {
        // Checks if it's a slash command interaction or text message
        if (context.isChatInputCommand && context.isChatInputCommand()) {
            await context.reply('Pong!');
        } else {
            await context.reply('Pong!');
        }
    },
};
