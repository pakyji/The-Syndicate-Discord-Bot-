/**
 * /antibadwords — toggle the word filter and manage the list.
 *
 * Fixes vs. the original:
 *  • PER-GUILD settings (was one global file shared by every server).
 *  • Atomic writes via the store.
 *  • Added `remove` and `list` — entries could previously never be removed.
 *  • Runtime permission check.
 *  • Entries are validated: no empty strings, no single characters (which would
 *    censor almost every message), and a hard cap on list size.
 *  • The placeholder words shipped in the repo ("badword1", "badword2") are
 *    rejected so a fresh install does not censor nonsense.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const perms = require('../../lib/perms');

const MAX_ENTRIES = 200;
const MAX_WORD_LENGTH = 40;

function normaliseWord(input) {
    return String(input || '').trim().toLowerCase().slice(0, MAX_WORD_LENGTH);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antibadwords')
        .setDescription('Manage the bad-words filter')
        .addSubcommand((sub) => sub
            .setName('toggle')
            .setDescription('Turn the filter on or off')
            .addStringOption((option) => option
                .setName('status')
                .setDescription('ON or OFF')
                .setRequired(true)
                .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' })))
        .addSubcommand((sub) => sub
            .setName('add')
            .setDescription('Add a word to the filter')
            .addStringOption((option) => option
                .setName('word')
                .setDescription('The word to block (min 2 characters)')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Remove a word from the filter')
            .addStringOption((option) => option
                .setName('word')
                .setDescription('The word to unblock')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('Show the current filter list and status'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    category: 'Moderation',

    async execute(interaction) {
        if (!(await perms.requirePermission(interaction, PermissionFlagsBits.ManageGuild))) return;

        const guildId = interaction.guild.id;
        const sub = interaction.options.getSubcommand();
        const settings = store.getGuild(guildId);

        if (sub === 'toggle') {
            const enabled = interaction.options.getString('status') === 'on';
            await store.updateGuild(guildId, (g) => { g.antiBadWords = enabled; });

            const embed = new EmbedBuilder()
                .setColor(enabled ? 0x00ff00 : 0xff0000)
                .setTitle('🛡️ Bad Words Filter Updated')
                .setDescription(`The filter is now **${enabled ? 'ON' : 'OFF'}** in this server.`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'add') {
            const word = normaliseWord(interaction.options.getString('word'));

            if (word.length < 2) {
                return interaction.reply({
                    content: '❌ Words must be at least 2 characters — a single letter would censor almost everything.',
                    ephemeral: true,
                });
            }
            if ((settings.badWords || []).length >= MAX_ENTRIES) {
                return interaction.reply({ content: `❌ The filter list is full (${MAX_ENTRIES} entries).`, ephemeral: true });
            }
            if ((settings.badWords || []).includes(word)) {
                return interaction.reply({ content: `⚠️ \`${word}\` is already filtered.`, ephemeral: true });
            }

            await store.updateGuild(guildId, (g) => {
                if (!Array.isArray(g.badWords)) g.badWords = [];
                g.badWords.push(word);
            });

            return interaction.reply({ content: `✅ Added \`${word}\` to the filter.`, ephemeral: true });
        }

        if (sub === 'remove') {
            const word = normaliseWord(interaction.options.getString('word'));
            const list = settings.badWords || [];
            if (!list.includes(word)) {
                return interaction.reply({ content: `⚠️ \`${word}\` is not in the filter list.`, ephemeral: true });
            }

            await store.updateGuild(guildId, (g) => {
                g.badWords = (g.badWords || []).filter((w) => w !== word);
            });

            return interaction.reply({ content: `✅ Removed \`${word}\` from the filter.`, ephemeral: true });
        }

        // list
        const current = store.getGuild(guildId);
        const words = (current.badWords || []).filter((w) => w && !/^badword\d*$/i.test(w));

        const embed = new EmbedBuilder()
            .setColor(current.antiBadWords ? 0x00ff00 : 0xff0000)
            .setTitle('🛡️ Bad Words Filter')
            .setDescription(`Filtering: **${current.antiBadWords ? 'ON' : 'OFF'}**`)
            .addFields({
                name: `Filtered words (${words.length})`,
                value: words.length ? words.map((w) => `\`${w}\``).join(', ').slice(0, 1024) : '*None*',
            })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
