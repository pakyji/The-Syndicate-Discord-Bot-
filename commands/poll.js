/**
 * /poll — create an official native Discord poll.
 *
 * Fixes vs. the original:
 *  • NO PERMISSION PRE-CHECK — the command replied "Creating your poll..." first
 *    and only then called `channel.send()`. In a locked channel the send threw,
 *    the rejection escaped to the global handler, and the moderator was left
 *    holding a success message for a poll that never appeared.
 *  • NO TRY/CATCH around the send, and no `await` on the reply that would have
 *    reported the failure.
 *  • HARDCODED 24-HOUR DURATION with no way to change it (Discord allows 1h–7d).
 *  • NO INPUT VALIDATION. Discord caps the question at 300 characters and each
 *    answer at 55, with 2–10 answers. Anything longer is rejected by the API with
 *    an opaque 50035 error *after* the success message had already been sent.
 *  • FIXED AT EXACTLY TWO OPTIONS. Native polls take up to ten.
 *  • `question`/`option1`/`option2` had no `setMinLength`/`setMaxLength`, so a
 *    single space or a 6000-character paste both reached the API.
 *  • No way to choose the channel — the poll always landed wherever the command
 *    was run, including in a staff channel.
 *
 * Also note: a first fix pass added a SECOND, reaction-based `commands/utility/
 * poll.js`. It was never in the upstream repo, it collided with this command's
 * name, and the loader silently discarded it — so the real `/poll` stayed broken
 * while the duplicate took up a slot. That file has been deleted; this is the
 * only poll command.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const perms = require('../lib/perms');

/** Discord's own limits for native polls. */
const LIMITS = {
    question: 300,
    answer: 55,
    minAnswers: 2,
    maxAnswers: 10,
    minHours: 1,
    maxHours: 24 * 7,
};
const DEFAULT_HOURS = 24; // same as the original hardcoded value

const pollData = new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create an official native Discord poll')
    .addStringOption((option) => option
        .setName('question')
        .setDescription('The question to ask')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(LIMITS.question))
    .addStringOption((option) => option
        .setName('option1')
        .setDescription('First answer')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(LIMITS.answer))
    .addStringOption((option) => option
        .setName('option2')
        .setDescription('Second answer')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(LIMITS.answer));

// Optional answers 3–10. Native polls support up to ten. (These cannot go in the
// chain above: spreading builder functions adds functions to the options array
// instead of calling them, which serialises to garbage.)
for (let i = 3; i <= LIMITS.maxAnswers; i++) {
    pollData.addStringOption((option) => option
        .setName(`option${i}`)
        .setDescription(`Optional answer ${i}`)
        .setMinLength(1)
        .setMaxLength(LIMITS.answer));
}

pollData
    .addIntegerOption((option) => option
        .setName('duration')
        .setDescription('How long the poll stays open, in hours (default 24)')
        .setMinValue(LIMITS.minHours)
        .setMaxValue(LIMITS.maxHours))
    .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post the poll (defaults to this channel)')
        .addChannelTypes(0))
    .addBooleanOption((option) => option
        .setName('multiselect')
        .setDescription('Allow voters to pick more than one answer (default no)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false);

module.exports = {
    data: pollData,

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageMessages))) return;

        const question = interaction.options.getString('question', true).trim();
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const hours = interaction.options.getInteger('duration') || DEFAULT_HOURS;
        const multiselect = interaction.options.getBoolean('multiselect') || false;

        const answers = [];
        for (let i = 1; i <= LIMITS.maxAnswers; i++) {
            const value = interaction.options.getString(`option${i}`);
            if (value && value.trim()) answers.push(value.trim());
        }

        /* ---- Validate everything BEFORE telling the user it worked ---- */
        if (!question) {
            return interaction.reply({ content: '❌ Please provide a question.', ephemeral: true });
        }
        if (answers.length < LIMITS.minAnswers) {
            return interaction.reply({
                content: `❌ A poll needs at least ${LIMITS.minAnswers} answers.`,
                ephemeral: true,
            });
        }
        if (question.length > LIMITS.question) {
            return interaction.reply({
                content: `❌ The question must be ${LIMITS.question} characters or fewer.`,
                ephemeral: true,
            });
        }
        const tooLong = answers.findIndex((a) => a.length > LIMITS.answer);
        if (tooLong !== -1) {
            return interaction.reply({
                content: `❌ Answer ${tooLong + 1} is ${answers[tooLong].length} characters — Discord allows ${LIMITS.answer}.`,
                ephemeral: true,
            });
        }
        if (new Set(answers.map((a) => a.toLowerCase())).size !== answers.length) {
            return interaction.reply({ content: '❌ Two of the answers are the same.', ephemeral: true });
        }
        if (channel.guildId !== interaction.guildId) {
            return interaction.reply({ content: '❌ That channel is not in this server.', ephemeral: true });
        }

        const me = interaction.guild.members.me;
        const botPerms = channel.permissionsFor(me);
        if (!botPerms || !botPerms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
            return interaction.reply({
                content: `❌ I don't have permission to send messages in ${channel}.`,
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        let message;
        try {
            message = await channel.send({
                poll: {
                    question: { text: question },
                    // `emoji: null` is required by the API shape for text-only answers.
                    answers: answers.map((text) => ({ text })),
                    allowMultiselect: multiselect,
                    duration: hours,
                },
            });
        } catch (error) {
            console.error('[poll] could not create the poll:', error.message);
            return interaction.editReply({
                content: `❌ Discord rejected the poll: ${error.message}. `
                    + 'Native polls also need the bot to be able to send polls in that channel.',
            });
        }

        return interaction.editReply({
            content: `✅ Poll posted in ${channel} — **${answers.length}** answers, `
                + `open for **${hours}** hour(s). ${multiselect ? 'Voters can pick several.' : ''}`
                + `\n${message.url}`,
        });
    },
};
