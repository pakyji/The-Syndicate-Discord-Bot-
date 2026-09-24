const { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'setupverify',
    category: 'Moderation',
    description: 'Send the verification panel with platform buttons',
    async execute(ctx) {
        const isSlash = ctx.isChatInputCommand && ctx.isChatInputCommand();

        // Check if user has management permissions
        const member = ctx.member || await ctx.guild.members.fetch(ctx.user.id).catch(() => null);
        if (!member || !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const errReply = 'You do not have permission to use this command.';
            return isSlash 
                ? await ctx.reply({ content: errReply, ephemeral: true }) 
                : await ctx.reply(errReply);
        }

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('The Syndicate')
            .setDescription('Welcome! Click your gaming platform below to unlock the server.');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('verify_ps4')
                .setLabel('PS4')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎮'),
            new ButtonBuilder()
                .setCustomId('verify_ps5')
                .setLabel('PS5')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎮'),
            new ButtonBuilder()
                .setCustomId('verify_pc')
                .setLabel('PC')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💻'),
            new ButtonBuilder()
                .setCustomId('verify_nongamer')
                .setLabel('Non-Gamer')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👤')
        );

        try {
            await ctx.channel.send({ embeds: [embed], components: [row] });
            if (isSlash) {
                await ctx.reply({ content: 'Verification panel sent successfully!', ephemeral: true });
            } else {
                await ctx.message.delete().catch(() => {});
            }
        } catch (error) {
            console.error('Setupverify error:', error);
            const errReply = 'Failed to send the verification panel.';
            return isSlash 
                ? await ctx.reply({ content: errReply, ephemeral: true }) 
                : await ctx.reply(errReply);
        }
    },
};
