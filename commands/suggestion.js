/**
 * /suggestion — submit a suggestion that members can react to.
 *
 * Posts a suggestion embed and pins it. Members react with 👍 to vote.
 * The suggestion is posted to a configurable channel and reacts are counted
 * automatically via the pollReactions event (or a simple counter).
 */
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../lib/config');
const perms = require('../lib/perms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Submit a suggestion for the server')
        .addStringOption(option =>
            option.setName('suggestion')
                .setDescription('Your suggestion text')
                .setRequired(true)
                .setMinLength(5)
                .setMaxLength(500))
        .addStringOption(option =>
            option.setName('anonymous')
                .setDescription('Post anonymously?')
                .setRequired(false)
                .addChoices({ name: 'Yes', value: 'yes' }, { name: 'No', value: 'no' }))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

    category: 'Utility',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageMessages))) return;

        const suggestionText = interaction.options.getString('suggestion', true);
        const anonymous = interaction.options.getString('anonymous') === 'yes';
        const author = anonymous ? 'Anonymous' : interaction.user.tag;

        const suggestionChannelId = config.channels.helperAnnounce;
        if (!suggestionChannelId) {
            return interaction.reply({
                content: '❌ No suggestion channel configured. Set HELPER_CHANNEL_ID in .env.',
                ephemeral: true,
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('💡 Suggestion')
            .addFields(
                { name: 'Suggestion', value: suggestionText },
                { name: 'Suggested by', value: author },
                { name: 'Status', value: '🟡 Under Review' },
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('suggestion_up').setLabel('👍').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('suggestion_down').setLabel('👎').setStyle(ButtonStyle.Secondary),
        );

        try {
            const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
            await message.react('👍');
            await message.react('👎');
        } catch (error) {
            console.error('[suggestion] failed to post:', error.message);
            return interaction.reply({ content: '❌ Failed to post suggestion.', ephemeral: true });
        }
    },
};