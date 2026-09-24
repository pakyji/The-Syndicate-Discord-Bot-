module.exports = {
    name: 'clear',
    category: 'Moderation',
    description: 'Delete messages',
    async execute(ctx) {
        const amount = ctx.options ? ctx.options.getInteger('amount') : 5;
        
        if (ctx.isChatInputCommand && ctx.isChatInputCommand()) {
            await ctx.channel.bulkDelete(amount, true).catch(() => {});
            await ctx.reply({ content: `Cleared ${amount} messages.`, ephemeral: true });
        } else {
            await ctx.channel.bulkDelete(5, true).catch(() => {});
            await ctx.reply('Cleared recent messages.');
        }
    },
};
