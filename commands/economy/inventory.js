/**
 * /inventory — list what a member owns.
 *
 * Fixes vs. the original:
 *  • Reads the unified store instead of the private economyStorage.json, so it
 *    finally shows the same items the shop just sold (they were different files).
 *  • The CWD-relative path is gone — starting the bot from another directory no
 *    longer produces an empty inventory.
 *  • Empty inventory now produces a helpful reply instead of a blank embed.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const { itemName, money } = require('../../lib/economy');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your items and minerals')
        .addUserOption((option) => option
            .setName('user')
            .setDescription('View another member\'s inventory')
            .setRequired(false)),

    category: 'Economy',

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        if (targetUser.bot) {
            return interaction.reply({ content: '🤖 Bots do not have an inventory.', ephemeral: true });
        }

        const inventory = store.getInventory(targetUser.id);
        const entries = Object.entries(inventory).filter(([, qty]) => Number(qty) > 0);

        const { level, xp } = store.getLevel(targetUser.id);
        const wallet = store.getWallet(targetUser.id);
        const bank = store.getBank(targetUser.id);

        if (!entries.length) {
            const embed = new EmbedBuilder()
                .setColor(0x808080)
                .setTitle(`🎒 ${targetUser.username}'s Inventory`)
                .setDescription('Empty. Buy tools with `/shop` or find minerals with `/mine`.')
                .addFields({ name: 'Wallet', value: money(wallet), inline: true })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: targetUser.id !== interaction.user.id });
        }

        // Group by category for readability.
        const byCategory = new Map();
        for (const [key, qty] of entries) {
            const category = itemName(key) ? categoryOf(key) : 'Other';
            if (!byCategory.has(category)) byCategory.set(category, []);
            byCategory.get(category).push(`• ${itemName(key)} — x${qty}`);
        }

        const embed = new EmbedBuilder()
            .setColor(0x4169e1)
            .setTitle(`🎒 ${targetUser.username}'s Inventory`)
            .setDescription(`**Level ${level}** (${xp} XP) · Wallet ${money(wallet)} · Bank ${money(bank)}`)
            .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 128 }))
            .setTimestamp();

        for (const [category, lines] of byCategory) {
            embed.addFields({ name: `📁 ${category}`, value: lines.join('\n').slice(0, 1024), inline: false });
        }

        return interaction.reply({ embeds: [embed], ephemeral: targetUser.id !== interaction.user.id });
    },
};

/** Cheap category lookup without importing the whole catalog shape. */
function categoryOf(key) {
    try {
        // eslint-disable-next-line global-require
        const { ITEMS } = require('../../lib/economy');
        return ITEMS[key]?.category || 'Other';
    } catch {
        return 'Other';
    }
}
