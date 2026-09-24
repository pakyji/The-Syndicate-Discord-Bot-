const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'help',
    category: 'General',
    description: 'Show all commands',
    async execute(ctx) {
        const client = ctx.client || ctx.application?.client;
        const commands = client ? client.commands : null;
        
        if (!commands) {
            const fallbackMsg = 'Commands: /ping, /help, /roll, /clear, /ban, /kick';
            if (ctx.reply) return ctx.reply(fallbackMsg);
            return;
        }

        const categories = {};
        commands.forEach(cmd => {
            const cat = cmd.category || 'General';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(`\`/${cmd.name}\` - ${cmd.description || 'No description'}`);
        });

        const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('The Syndicate • Commands')
            .setTimestamp();

        for (const [cat, cmds] of Object.entries(categories)) {
            embed.addFields({ name: cat, value: cmds.join('\n'), inline: false });
        }

        if (ctx.isChatInputCommand && ctx.isChatInputCommand()) {
            await ctx.reply({ embeds: [embed] });
        } else {
            await ctx.reply({ embeds: [embed] });
        }
    },
};
