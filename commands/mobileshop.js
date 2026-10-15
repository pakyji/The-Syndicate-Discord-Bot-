/**
 * /mobileshop — phones, gadgets and tech roles.
 *
 * Fixes vs. the original:
 *  • DOUBLE SPEND: same stale-snapshot pattern as minimarket — read once at the
 *    top, check against it, deduct after awaits. Now atomic via lib/purchase.js.
 *  • ROLE GIVEN AWAY FREE: this file added the role FIRST and saved the deduction
 *    afterwards (`await roles.add(role); await saveCoinsData(...)`). If the save
 *    failed — or the process died in between — the member kept the role and their
 *    coins. Order is now deduct → deliver → refund.
 *  • Role lookup by name with no hierarchy check; decoy "Tech Geek" / "Master
 *    Hacker" roles could be created and sold by anyone with Manage Roles.
 *  • Purchases were never recorded in the inventory.
 *  • Phone "cashback" was uncapped and could exceed the price paid.
 *  • Catalogue/choices/embed were three separate hand-maintained copies.
 */
const { buildCommand, storefrontEmbed, handleBuy } = require('../lib/shopkit');

const ITEMS = {
    case: { name: '📱 Carbon Phone Case', price: 120, type: 'item', desc: 'Protects your phone from drop damage.' },
    airpods: { name: '🎧 Wireless Earbuds', price: 250, type: 'item', desc: 'Listen to server music in ultra HD.' },
    charger: { name: '⚡ Fast Charger 120W', price: 400, type: 'item', desc: 'Charges your devices in zero seconds.' },
    android: { name: '🤖 Flagship Android Phone', price: 1200, type: 'item', desc: 'Top-tier specs with coin cashback.' },
    iphone: { name: '🍏 Pro Max Smartphone', price: 2000, type: 'item', desc: 'The ultimate flex, with a big reward.' },
    geek: { name: '💻 Tech Geek Role', price: 800, type: 'role', roleName: 'Tech Geek', desc: 'For true hardware lovers.' },
    nerd: { name: '⚙️ Master Hacker Role', price: 1500, type: 'role', roleName: 'Master Hacker', desc: 'Elite server tech badge.' },
};

const SECTIONS = [
    { label: '🔌 Accessories & Gadgets', keys: ['case', 'airpods', 'charger'] },
    { label: '🤖 Flagship Smartphones', keys: ['android', 'iphone'] },
    { label: '💻 Exclusive Tech Roles', keys: ['geek', 'nerd'] },
];

/** Cashback never exceeds the price paid (capRatio 1 = at most break-even). */
const BONUSES = {
    android: { min: 100, max: 500, capRatio: 1, label: '🤖 Android trade-in cashback!' },
    iphone: { min: 200, max: 900, capRatio: 1, label: '🍏 Pro Max launch reward!' },
};

module.exports = {
    data: buildCommand({
        name: 'mobileshop',
        description: 'Visit the high-tech mobile and electronics store',
        items: ITEMS,
    }),

    category: 'Economy',

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'view') {
            const embed = storefrontEmbed({
                title: '📱 TechWorld Mobile & Electronics',
                color: '#3498db',
                blurb: 'Welcome to the gadget hub — phones, accessories and tech roles.',
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
            theme: { successTitle: '📦 Purchase Successful!', successColor: '#2ecc71' },
        });
    },
};
