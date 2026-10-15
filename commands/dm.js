/**
 * /dm — send a DM to a member through the bot.
 *
 * Fixes vs. the original:
 *  • ⭐ Before the permission fix this was usable by EVERY member, which meant
 *    anyone could make the official bot DM arbitrary users — a direct phishing
 *    and impersonation vector. It is now gated at registration and at runtime.
 *  • No rate limiting: an admin (or previously anyone) could loop this to mass-DM
 *    users, which breaches Discord's platform policy and can get the bot banned.
 *    There is now a per-admin cooldown and a daily cap.
 *  • No audit trail. Using the bot to speak to a member is an administrative act;
 *    every use is now logged to the staff log channel.
 *  • The footer revealed which admin sent it. That is kept, but only because an
 *    anonymous staff DM is worse practice — and it is now explicit and optional.
 *  • Length capped to Discord's 4096-character embed description limit (an over
 *    long message previously surfaced as a raw API error).
 *  • `targetUser.tag` is deprecated in v14; uses `username`.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const perms = require('../lib/perms');
const config = require('../lib/config');
const { Cooldowns } = require('../lib/cooldowns');

const MAX_LENGTH = 4000;
const COOLDOWN_MS = 10 * 1000;
const DAILY_CAP = 50;

const cooldowns = new Cooldowns(COOLDOWN_MS, 500);
const dailyCounts = new Map(); // adminId -> { day, count }

function bumpDaily(adminId) {
    const day = new Date().toISOString().slice(0, 10);
    const entry = dailyCounts.get(adminId);
    if (!entry || entry.day !== day) {
        dailyCounts.set(adminId, { day, count: 1 });
        return 1;
    }
    entry.count += 1;
    return entry.count;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send a direct message to a member through the bot')
        .addUserOption((option) => option
            .setName('target')
            .setDescription('The member to message')
            .setRequired(true))
        .addStringOption((option) => option
            .setName('message')
            .setDescription('The message to send')
            .setRequired(true)
            .setMaxLength(MAX_LENGTH))
        .addBooleanOption((option) => option
            .setName('anonymous')
            .setDescription('Hide which staff member sent it (still logged internally)')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator))) return;

        const targetUser = interaction.options.getUser('target');
        const messageContent = interaction.options.getString('message').slice(0, MAX_LENGTH);
        const anonymous = interaction.options.getBoolean('anonymous') === true;

        if (targetUser.bot) {
            return interaction.reply({ content: '❌ You cannot DM a bot.', ephemeral: true });
        }
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot DM yourself through the bot.', ephemeral: true });
        }

        // Rate limits — mass-DMing through a bot breaches Discord's policy.
        if (!cooldowns.take(interaction.user.id)) {
            return interaction.reply({
                content: `⏳ Slow down — wait **${Math.ceil(cooldowns.remaining(interaction.user.id) / 1000)}s** between bot DMs.`,
                ephemeral: true,
            });
        }
        const used = bumpDaily(interaction.user.id);
        if (used > DAILY_CAP) {
            cooldowns.clear(interaction.user.id);
            return interaction.reply({
                content: `❌ Daily limit reached (${DAILY_CAP} bot DMs per admin). Mass-DMing users risks the bot being banned by Discord.`,
                ephemeral: true,
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('The Syndicate • Staff Message')
            .setDescription(messageContent)
            .setFooter({
                text: anonymous
                    ? 'Sent by the moderation team'
                    : `Sent by ${interaction.user.username}`,
                iconURL: anonymous ? undefined : interaction.user.displayAvatarURL({ extension: 'png', size: 64 }),
            })
            .setTimestamp();

        try {
            await targetUser.send({ embeds: [embed] });
        } catch (error) {
            // 50007 = cannot send messages to this user (DMs closed / blocked).
            const hint = error.code === 50007
                ? 'Their direct messages are closed, or they have blocked the bot.'
                : 'The message could not be delivered.';
            return interaction.reply({
                content: `❌ Could not DM **${targetUser.username}**. ${hint}`,
                ephemeral: true,
            });
        }

        // Audit trail — always records the real sender, even for "anonymous" DMs.
        if (config.channels.errorLog) {
            const logChannel = interaction.guild.channels.cache.get(config.channels.errorLog)
                || await interaction.guild.channels.fetch(config.channels.errorLog).catch(() => null);

            if (logChannel && logChannel.isTextBased()) {
                const audit = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📮 Staff DM sent')
                    .addFields(
                        { name: 'From', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
                        { name: 'To', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                        { name: 'Shown as', value: anonymous ? 'Anonymous' : 'Named', inline: true },
                        { name: 'Message', value: messageContent.slice(0, 1024) },
                        { name: 'Today', value: `${used}/${DAILY_CAP}`, inline: true },
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [audit] }).catch(() => {});
            }
        }

        return interaction.reply({
            content: `✅ Sent a DM to **${targetUser.username}** (${used}/${DAILY_CAP} today).`,
            ephemeral: true,
        });
    },
};
