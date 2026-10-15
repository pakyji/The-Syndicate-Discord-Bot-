/**
 * Shared engine for the three themed coin shops (minimarket, mobileshop, simshop).
 *
 * All three previously open-coded the same flow and therefore shared the same
 * double-spend race, the same no-refund-on-failure bug and the same role-name
 * lookup with no hierarchy check (see lib/purchase.js for the full write-up).
 * They also duplicated their catalogue, choices and embed layout.
 *
 * This module owns that logic once. Each shop file now only declares its theme,
 * its items and its bonus table.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('./data');
const { purchase, applyBonus } = require('./purchase');

/**
 * Build the slash-command definition for a themed shop.
 * Choices are generated from the catalogue so the two can never drift apart
 * (simshop.js previously listed prices in `addChoices` separately from
 * `simItems`, and they disagreed).
 */
function buildCommand({ name, description, items }) {
    const entries = Object.entries(items);

    const buy = entries.slice(0, 25).map(([key, item]) => ({
        name: `${item.name} — ${item.price} coins`,
        value: key,
    }));

    return new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .addSubcommand((sub) => sub
            .setName('view')
            .setDescription('Browse the catalogue'))
        .addSubcommand((sub) => sub
            .setName('buy')
            .setDescription('Buy an item or role')
            .addStringOption((option) => {
                option.setName('item')
                    .setDescription('What to buy')
                    .setRequired(true);
                for (const choice of buy) option.addChoices(choice);
                return option;
            }));
}

/** Group the catalogue by section for the storefront embed. */
function storefrontEmbed({ title, color, blurb, items, sections, userId }) {
    const balance = store.getWallet(userId);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`${blurb}\n\nUse \`/view\` then \`buy\` to purchase.`)
        .setTimestamp();

    for (const section of sections) {
        const lines = Object.entries(items)
            .filter(([key]) => section.keys.includes(key))
            .map(([key, item]) => {
                const own = Number(store.getInventory(userId)[key]) || 0;
                const owned = item.type === 'role' ? '' : (own ? ` *(owned: ${own})*` : '');
                return `• ${item.name} — **${item.price}** coins \`${key}\`${owned}`;
            });
        if (lines.length) {
            embed.addFields({ name: section.label, value: lines.join('\n').slice(0, 1024), inline: false });
        }
    }

    embed.setFooter({ text: `Your balance: ${balance.toLocaleString('en-US')} coins 🪙` });
    return embed;
}

/**
 * Handle a purchase.
 *
 * `deferFirst` matters: simshop shows a registration modal and the original code
 * checked the balance BEFORE the modal and deducted AFTER it — a window of up to
 * 60 seconds during which the same coins could be spent twice. Affordability is
 * now re-checked at deduction time by store.spend(), so the earlier check is only
 * a fast-fail hint.
 */
async function handleBuy({ interaction, items, bonuses, theme }) {
    const userId = interaction.user.id;
    const key = interaction.options.getString('item');
    const item = items[key];

    if (!item) {
        return interaction.reply({ content: '❌ That is not a valid item.', ephemeral: true });
    }
    if (interaction.user.bot) {
        return interaction.reply({ content: '🤖 Bots cannot make purchases.', ephemeral: true });
    }

    // Fast-fail hint only — the authoritative check happens inside store.spend().
    const wallet = store.getWallet(userId);
    if (wallet < item.price) {
        return interaction.reply({
            content: `❌ You need **${item.price}** coins for ${item.name}, but you have **${wallet.toLocaleString('en-US')}**.`,
            ephemeral: true,
        });
    }

    // A role purchase needs the guild/member, which a DM context does not have.
    if (item.type === 'role' && (!interaction.inGuild() || !interaction.member)) {
        return interaction.reply({ content: '❌ Role purchases only work inside the server.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await purchase({
        guild: interaction.guild,
        member: interaction.member,
        userId,
        item: { ...item, key },
    });

    if (!result.ok) {
        const message = result.error === 'insufficient'
            ? `❌ You can no longer afford ${item.name} — your balance changed since you started. You have **${result.balance.toLocaleString('en-US')}** coins.`
            : `❌ ${result.error}`;
        return interaction.editReply({ content: message });
    }

    // Optional themed cashback, clamped so a bonus can never exceed the price paid.
    let bonusText = '';
    const bonusRule = bonuses && bonuses[key];
    if (bonusRule) {
        const cap = Math.max(1, Math.floor(item.price * (bonusRule.capRatio ?? 1)));
        const { bonus, balance } = await applyBonus(userId, bonusRule.min, bonusRule.max, cap);
        if (bonus > 0) {
            bonusText = `\n🎁 **${bonusRule.label}** You received **${bonus.toLocaleString('en-US')}** coins back!`;
            result.balance = balance;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(theme.successColor)
        .setTitle(`${theme.successTitle}`)
        .setDescription(
            item.type === 'role'
                ? `You purchased ${item.name} and the **${result.granted}** role has been assigned.`
                : `You purchased ${item.name}. It is now in your \`/inventory\`.`,
        )
        .addFields(
            { name: 'Price', value: `${item.price.toLocaleString('en-US')} coins`, inline: true },
            { name: 'Remaining balance', value: `${result.balance.toLocaleString('en-US')} coins`, inline: true },
        )
        .setTimestamp();

    return interaction.editReply({ content: bonusText || undefined, embeds: [embed] });
}

module.exports = { buildCommand, storefrontEmbed, handleBuy };
