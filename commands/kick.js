/**
 * /kick — remove a member from the server.
 *
 * Original problems:
 *  • Legacy `{name, execute}` format → index.js registered it with zero options,
 *    so the required `target` user option never existed and the command could
 *    never actually kick anyone.
 *  • It kept dead branches for text-message (`ctx.message`) invocation that this
 *    slash-only bot never receives.
 *  • No role-hierarchy check, so a mod could target another mod.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const perms = require('../lib/perms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .addUserOption((option) => option
            .setName('target')
            .setDescription('The member to kick')
            .setRequired(true))
        .addStringOption((option) => option
            .setName('reason')
            .setDescription('Reason for the kick')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.KickMembers))) return;

        const targetUser = interaction.options.getUser('target');
        const reason = (interaction.options.getString('reason') || 'No reason provided').slice(0, 500);

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot kick yourself.', ephemeral: true });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.reply({ content: '❌ I am missing the **Kick Members** permission.', ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        }
        if (!perms.canModerate(interaction.member, member)) {
            return interaction.reply({
                content: '❌ You cannot kick this member — they hold an equal or higher role than you.',
                ephemeral: true,
            });
        }
        if (!member.kickable) {
            return interaction.reply({
                content: '❌ I cannot kick this member. My role must be above theirs.',
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        // Notify first — impossible after the kick.
        await targetUser.send({
            content: `You have been kicked from **${interaction.guild.name}**.\nReason: ${reason}`,
        }).catch(() => {});

        try {
            await member.kick(`Kicked by ${interaction.user.tag}: ${reason}`);
        } catch (error) {
            console.error('[kick] failed:', error.message);
            return interaction.editReply({ content: '❌ Failed to kick that member.' });
        }

        const embed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle('👢 Member Kicked')
            .addFields(
                { name: 'Member', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Reason', value: reason },
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },
};
