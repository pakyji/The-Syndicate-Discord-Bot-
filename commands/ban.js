const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    // Usiamo SlashCommandBuilder per definire chiaramente il nome, la descrizione e le opzioni
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to ban')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(ctx) {
        // Gestione sia per Slash che per Prefissi normali
        const isSlash = ctx.isChatInputCommand && ctx.isChatInputCommand();

        if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            const errReply = 'You do not have permission to use this command.';
            return isSlash 
                ? await ctx.reply({ content: errReply, ephemeral: true }) 
                : await ctx.reply(errReply);
        }

        const target = isSlash 
            ? ctx.options.getUser('target') 
            : ctx.mentions.users.first();

        if (!target) {
            const errReply = 'Please specify a user to ban.';
            return isSlash 
                ? await ctx.reply({ content: errReply, ephemeral: true }) 
                : await ctx.reply(errReply);
        }

        const member = await ctx.guild.members.fetch(target.id).catch(() => null);
        if (!member) {
            const errReply = 'That user is not in this server.';
            return isSlash 
                ? await ctx.reply({ content: errReply, ephemeral: true }) 
                : await ctx.reply(errReply);
        }

        try {
            await member.ban();
            const successMsg = `Successfully banned **${target.tag || target.username}**.`;
            
            if (isSlash) {
                const sent = await ctx.reply({ content: successMsg, fetchReply: true });
                setTimeout(() => sent.delete().catch(() => {}), 5000);
            } else {
                const sent = await ctx.reply(successMsg);
                setTimeout(() => sent.delete().catch(() => {}), 5000);
            }
        } catch (error) {
            console.error(error);
            const errReply = 'Failed to ban this user.';
            return isSlash 
                ? await ctx.reply({ content: errReply, ephemeral: true }) 
                : await ctx.reply(errReply);
        }
    },
};
