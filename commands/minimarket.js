/**
 * /minimarket — Italian snack bar.
 *
 * Fixes vs. the original:
 *  • DOUBLE SPEND: the balance was read once at the top and the affordability
 *    check used that snapshot, while the deduction happened after several awaits.
 *    Purchases are now atomic via lib/purchase.js.
 *  • NO REFUND: coins were deducted and then, for a role purchase, only *saved*
 *    if `roles.add()` succeeded — so a failed role add silently discarded the
 *    deduction in one path and lost the coins in another. Now: deduct → deliver →
 *    refund on failure.
 *  • Roles were matched by NAME with no hierarchy or permission check, so anyone
 *    with Manage Roles could create a decoy "VIP"/"Legend" role and sell it, and a
 *    role above the bot always failed after payment.
 *  • Purchased items were never recorded, so `/inventory` never showed them.
 *  • The scratch card and mystery box paid out uncapped random amounts; bonuses
 *    are now clamped to the price paid.
 *  • Catalogue, choices and embed are generated from one source instead of being
 *    duplicated (they had already drifted).
 */
const { buildCommand, storefrontEmbed, handleBuy } = require('../lib/shopkit');

const ITEMS = {
    coffee: { name: '☕ Hot Espresso', price: 30, type: 'item', desc: 'Fresh Italian coffee to stay active.' },
    energy: { name: '⚡ Energy Drink', price: 50, type: 'item', desc: 'Boost your chat energy.' },
    pizza: { name: '🍕 Slice of Pizza', price: 80, type: 'item', desc: 'Delicious cheesy Italian pizza slice.' },
    snacks: { name: '🍿 Movie Popcorn', price: 100, type: 'item', desc: 'Crunchy snacks for gaming nights.' },
    scratch: { name: '🎟️ Lucky Scratch Card', price: 150, type: 'item', desc: 'Scratch to win random coins back.' },
    mystery: { name: '🎁 Super Mystery Box', price: 300, type: 'item', desc: 'Contains a coin jackpot.' },
    vip: { name: '⭐ VIP Role', price: 500, type: 'role', roleName: 'VIP', desc: 'Exclusive VIP role badge.' },
    legend: { name: '🔥 Legend Role', price: 1000, type: 'role', roleName: 'Legend', desc: 'The ultimate flex role.' },
};

const SECTIONS = [
    { label: '🥪 Snacks & Refreshments', keys: ['coffee', 'energy', 'pizza', 'snacks'] },
    { label: '🎲 Fun & Mystery', keys: ['scratch', 'mystery'] },
    { label: '👑 Exclusive Roles', keys: ['vip', 'legend'] },
];

/** Cashback is capped at the price paid, so a purchase can never be net-positive. */
const BONUSES = {
    scratch: { min: 10, max: 400, capRatio: 2.5, label: '🎟️ Scratch card winner!' },
    mystery: { min: 50, max: 900, capRatio: 3, label: '🎁 Mystery box jackpot!' },
};

module.exports = {
    data: buildCommand({
        name: 'minimarket',
        description: 'Visit the Italian mini-market for snacks, mystery boxes and roles',
        items: ITEMS,
    }),

    category: 'Economy',

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'view') {
            const embed = storefrontEmbed({
                title: '🏪 Syndicate Mini-Market',
                color: '#e67e22',
                blurb: 'Benvenuti! Fresh coffee, pizza and a bit of gambling.',
                items: ITEMS,
                sections: SECTIONS,
                userId: interaction.user.id,
            });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        return handleBuy({
            interaction,
            items: ITEMS,
            bonuses: BONUSES,
            theme: { successTitle: '🛒 Purchase Successful!', successColor: '#2ecc71' },
        });
    },
};
