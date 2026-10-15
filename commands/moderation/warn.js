/**
 * /warn — issue a persistent warning to a member.
 *
 * The original file was NOT a warn command at all: it was a copy-paste of
 * antispam.js that built its own `new Client()` and called
 * `client.login(process.env.DISCORD_TOKEN)` at module scope. Because index.js
 * require()s every file under commands/, that opened a SECOND gateway session
 * on the same token — Discord invalidates the older session, producing an
 * endless disconnect/reconnect loop. It also had no module.exports, so the
 * loader skipped it and /warn never existed.
 *
 * This is a real warn command, gated behind ModerateMembers, with warnings
 * persisted to disk (the original kept them in a memory Map that reset on
 * every restart).
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const data = require('../../lib/data');
const perms = require('../../lib/perms');
const config = require('../../lib/config');

/** Auto-escalation thresholds. */
const ESCALATION = [
    { at: 3, action: 'timeout', minutes: 10 },
    { at: 5, action: 'timeout', minutes: 60 },
    { at: 8, action: 'kick' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member (warnings are saved permanently)')
        .addUserOption((option) => option
            .setName('target')
            .setDescription('The member to warn')
            .setRequired(true))
        .addStringOption((option) => option
            .setName('reason')
            .setDescription('Reason for the warning')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ModerateMembers))) return;

        const targetUser = interaction.options.getUser('target');
        const reason = (interaction.options.getString('reason') || 'No reason provided').slice(0, 500);

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot warn yourself.', ephemeral: true });
        }
        if (targetUser.bot) {
            return interaction.reply({ content: '❌ Bots cannot be warned.', ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        }
        if (!perms.canModerate(interaction.member, member)) {
            return interaction.reply({
                content: '❌ You cannot warn this member — they hold an equal or higher role than you.',
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const total = await data.addWarning(targetUser.id, {
            reason,
            moderatorId: interaction.user.id,
            guildId: interaction.guild.id,
        });

        // Tell the member (best effort — DMs may be closed).
        const dmEmbed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle(`⚠️ Warning in ${interaction.guild.name}`)
            .setDescription(`**Reason:** ${reason}\n**Total warnings:** ${total}`)
            .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});

        // Escalate automatically at configured thresholds.
        let escalationNote = '';
        const rule = ESCALATION.find((e) => e.at === total);
        if (rule && member.moderatable) {
            const auditReason = `Auto-escalation after ${total} warnings: ${reason}`;
            try {
                if (rule.action === 'timeout') {
                    await member.timeout(rule.minutes * 60 * 1000, auditReason);
                    escalationNote = `\n⏱️ Auto-timed out for **${rule.minutes} minute(s)** (warning #${total}).`;
                } else if (rule.action === 'kick') {
                    await member.kick(auditReason);
                    escalationNote = `\n👢 Auto-kicked (warning #${total}).`;
                }
            } catch (error) {
                console.error('[warn] escalation failed:', error.message);
                escalationNote = '\n⚠️ Automatic escalation failed (check my role position).';
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle('⚠️ Member Warned')
            .addFields(
                { name: 'Member', value: `${targetUser} (\`${targetUser.id}\`)`, inline: true },
                { name: 'Moderator', value: `${interaction.user}`, inline: true },
                { name: 'Total warnings', value: `${total}`, inline: true },
                { name: 'Reason', value: reason },
            )
            .setTimestamp();

        await interaction.editReply({ content: escalationNote || undefined, embeds: [embed] });

        // Mirror to the staff log channel if one is configured.
        const logChannel = interaction.guild.channels.cache.get(config.channels.errorLog);
        if (logChannel && logChannel.isTextBased()) {
            await logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    },
};
