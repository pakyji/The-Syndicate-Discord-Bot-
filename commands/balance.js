/**
 * /balance — show a member's coin balance.
 *
 * Fixes vs. the original:
 *  • Read from the unified store. It previously read `./coins.json` — a path
 *    relative to the PROCESS CWD, not the script — while the shop/mine/slots
 *    commands read `commands/economy/economyStorage.json`. Earning and spending
 *    therefore touched different files and the two never agreed.
 *  • A CWD-relative path also means starting the bot from another directory
 *    (pm2, systemd, Docker WORKDIR) silently creates a second empty data file.
 *  • No synchronous disk read; the store caches.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const data = require('../lib/data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current coin balance')
        .addUserOption((option) => option
            .setName('user')
            .setDescription('Check another member\'s balance')
            .setRequired(false)),

    category: 'Economy',

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        if (targetUser.bot) {
            return interaction.reply({ content: '🤖 Bots do not have a balance.', ephemeral: true });
        }

        const balance = data.getBalance(targetUser.id);
        const { level, xp } = data.getLevel(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🪙 Coin Balance')
            .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 128 }))
            .addFields(
                { name: 'Balance', value: `**${balance.toLocaleString('en-US')}** coins`, inline: true },
                { name: 'Level', value: `**${level}** (${xp} XP)`, inline: true },
            )
            .setFooter({ text: targetUser.username })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
