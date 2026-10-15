/**
 * /simshop — SIM cards and network roles.
 *
 * This had the WORST version of the double-spend bug in the repo:
 *
 *     const coinsData = getCoinsData();          // balance read at the start
 *     if (userCoins < item.price) reject;        // checked against that snapshot
 *     await interaction.showModal(modal);        // user fills in a form...
 *     const modalInteraction = await interaction.awaitModalSubmit({ time: 60_000 });
 *     const latestData = getCoinsData();         // re-read 0-60 SECONDS later
 *     latestData[userId] -= item.price;          // deducted with NO re-check
 *
 * During that whole minute the affordability check had already passed, so the same
 * coins could be spent on /slots, /coinflip or another shop, and the deduction
 * then drove the balance negative. Two SIM purchases started together both passed
 * the single check and both deducted — classic lost update.
 *
 * Other fixes:
 *  • The registration modal asked for a PHONE NUMBER and stored nothing with it,
 *    so it was friction without purpose; it also never resolved, leaking the
 *    60-second await. Purchase is now immediate, and the "phone number" is kept
 *    as an optional cosmetic detail on the receipt rather than a blocking form.
 *  • Roles ("Network Guru", "Cyber Operator") were matched by name with no
 *    hierarchy or permission check.
 *  • Bonuses (up to +200 on a 250-coin SIM) were uncapped and could make a
 *    purchase net-positive — an infinite coin faucet when combined with the race.
 *    Cashback is now clamped to at most the price paid.
 *  • Catalogue, choices and the storefront embed were three separate copies that
 *    had drifted apart.
 */
const { buildCommand, storefrontEmbed, handleBuy } = require('../lib/shopkit');

const ITEMS = {
    tim_sim: { name: '📶 TIM Prepaid SIM', price: 100, type: 'item', desc: 'Classic national coverage.' },
    vodafone_sim: { name: '🔴 Vodafone 5G SIM', price: 150, type: 'item', desc: 'Ultra-fast 5G connection.' },
    windtre_sim: { name: '🟠 WindTre Unlimited SIM', price: 200, type: 'item', desc: 'Unlimited talk and text.' },
    iliad_sim: { name: '🟣 Iliad Flash SIM', price: 250, type: 'item', desc: 'Best-value low-cost SIM.' },
    network_guru: { name: '📡 Network Guru Role', price: 600, type: 'role', roleName: 'Network Guru', desc: 'For telecom experts.' },
    cyber_operator: { name: '🛰️ Cyber Telecom Operator', price: 1200, type: 'role', roleName: 'Cyber Operator', desc: 'Elite infrastructure controller.' },
};

const SECTIONS = [
    { label: '📡 Mobile Operator SIM Cards', keys: ['tim_sim', 'vodafone_sim', 'windtre_sim', 'iliad_sim'] },
    { label: '⭐ Telecom & Network Roles', keys: ['network_guru', 'cyber_operator'] },
];

/**
 * Activation bonuses. `capRatio: 1` clamps each payout to the SIM's own price, so
 * no purchase can ever return more coins than it cost (the original Iliad deal
 * paid up to 299 coins back on a 250-coin SIM — a guaranteed profit loop).
 */
const BONUSES = {
    tim_sim: { min: 10, max: 80, capRatio: 1, label: '📶 TIM activation bonus!' },
    vodafone_sim: { min: 20, max: 130, capRatio: 1, label: '🔴 Vodafone 5G network cashback!' },
    windtre_sim: { min: 30, max: 190, capRatio: 1, label: '🟠 WindTre top-up reward!' },
    iliad_sim: { min: 40, max: 250, capRatio: 1, label: '🟣 Iliad flash deal!' },
};

module.exports = {
    data: buildCommand({
        name: 'simshop',
        description: 'Visit the SIM card and mobile network provider shop',
        items: ITEMS,
    }),

    category: 'Economy',

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'view') {
            const embed = storefrontEmbed({
                title: '📶 Telecom & SIM Card Center',
                color: '#e74c3c',
                blurb: 'Choose your network operator — SIM cards activate instantly with a cashback bonus.',
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
            theme: { successTitle: '✅ SIM Activated / Role Assigned', successColor: '#2ecc71' },
        });
    },
};
