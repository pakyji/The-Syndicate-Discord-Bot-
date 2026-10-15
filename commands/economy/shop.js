/**
 * /shop — browse and buy items.
 *
 * Fixes vs. the original:
 *  • The purchase was a classic read-modify-write race: it read the wallet,
 *    checked affordability, then wrote `wallet -= price` at the end. Two
 *    concurrent purchases both passed the check and both deducted from the same
 *    stale snapshot, letting a user double-spend. Now uses `store.spend()`,
 *    which is atomic and returns ok=false when funds are insufficient — the item
 *    is only granted AFTER the deduction succeeds.
 *  • Item catalog moved to lib/economy.js (it was duplicated in five files and
 *    had drifted).
 *  • The `choices` list was hardcoded separately from `shopItems`, so the two
 *    could disagree. Choices are now generated from the catalog.
 *  • CWD-relative storage path replaced by the store.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const { ITEMS, money } = require('../../lib/economy');

const BUYABLE = Object.entries(ITEMS).filter(([, item]) => item.price > 0);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse the shop and buy tools, boosters and gear')
        .addStringOption((option) => {
            option.setName('item')
                .setDescription('The item you want to buy')
                .setRequired(false);
            // Discord caps a select at 25 choices.
            for (const [key, item] of BUYABLE.slice(0, 25)) {
                option.addChoices({ name: `${item.name} (${money(item.price)})`, value: key });
            }
            return option;
        }),

    category: 'Economy',

    async execute(interaction) {
        const userId = interaction.user.id;
        const selectedKey = interaction.options.getString('item');

        /* ── Storefront ─────────────────────────────────────────── */
        if (!selectedKey) {
            const wallet = store.getWallet(userId);
            const embed = new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle('🛒 Server Economy Shop')
                .setDescription(`Your wallet: **${money(wallet)}**\nUse \`/shop item:<name>\` to buy.`)
                .setTimestamp();

            const byCategory = new Map();
            for (const [key, item] of BUYABLE) {
                if (!byCategory.has(item.category)) byCategory.set(item.category, []);
                byCategory.get(item.category).push(`• **${item.name}** — ${money(item.price)} \`(${key})\``);
            }

            for (const [category, lines] of byCategory) {
                // Discord field values cap at 1024 characters.
                const value = lines.join('\n').slice(0, 1024);
                embed.addFields({ name: `📁 ${category}`, value, inline: false });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        /* ── Purchase ───────────────────────────────────────────── */
        const item = ITEMS[selectedKey];
        if (!item || item.price <= 0) {
            return interaction.reply({ content: '❌ That item is not for sale.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Atomic: fails if the wallet cannot cover the price.
        const { ok, balance } = await store.spend(userId, item.price);
        if (!ok) {
            return interaction.editReply({
                content: `❌ You cannot afford **${item.name}**. Price ${money(item.price)}, your wallet has ${money(balance)}.`,
            });
        }

        // Only grant the item once the money is safely deducted.
        await store.addItem(userId, selectedKey, 1);

        const owned = Number(store.getInventory(userId)[selectedKey]) || 0;

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🛍️ Purchase Successful!')
            .setDescription(`You bought **${item.name}** for ${money(item.price)}.`)
            .addFields(
                { name: 'Owned', value: `x${owned}`, inline: true },
                { name: 'Remaining wallet', value: money(balance), inline: true },
            )
            .setFooter({ text: 'Check /inventory to see your items.' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },
};
