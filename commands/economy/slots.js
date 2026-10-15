/**
 * /slots — three-reel slot machine.
 *
 * Fix vs. the original: same read-modify-write race as /coinflip — the wallet
 * was read once, mutated in memory across three branches, and written back at
 * the end, so concurrent spins double-spent. The stake is now taken atomically
 * before the reels spin.
 *
 * Also fixed: the reel display string was `[ ${slot1} \vert{}${slot2} | ${slot3} ]`,
 * which renders a literal `\vert{}` in Discord. Replaced with a clean separator.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const { Cooldowns } = require('../../lib/cooldowns');
const { MAX_BET, money } = require('../../lib/economy');

const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', ' 7️⃣ '];
const MEGA_SYMBOLS = [' 7️⃣ ', '💎'];

const COOLDOWN_MS = 5 * 1000;
const cooldowns = new Cooldowns(COOLDOWN_MS, 10000);

const BOOSTS = [
    { key: 'casino_chip_legendary', bonus: 0.08, label: 'Legendary Casino Chip' },
    { key: 'golden_ticket', bonus: 0.04, label: 'Golden Ticket' },
];

function spin() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play the slot machine')
        .addIntegerOption((option) => option
            .setName('amount')
            .setDescription('Amount to bet')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_BET)),

    category: 'Economy',

    async execute(interaction) {
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger('amount');

        if (!cooldowns.take(userId)) {
            return interaction.reply({
                content: `⏳ The machine is spinning for someone else — wait **${Math.ceil(cooldowns.remaining(userId) / 1000)}s**.`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        // 1. Atomic stake.
        const { ok, balance } = await store.spend(userId, bet);
        if (!ok) {
            cooldowns.clear(userId);
            return interaction.editReply({
                content: `❌ Not enough cash. Bet ${money(bet)}, wallet ${money(balance)}.`,
            });
        }

        // 2. Reels.
        const inventory = store.getInventory(userId);
        const boost = BOOSTS.find((b) => (Number(inventory[b.key]) || 0) > 0);

        const a = spin();
        let b = spin();
        const c = spin();

        // Perk: on an otherwise-losing roll, a chance to match the second reel.
        if (boost && a !== b && b !== c && Math.random() < boost.bonus) {
            b = a;
        }

        const triple = a === b && b === c;
        const pair = !triple && (a === b || b === c || a === c);

        let payout = 0;
        let message;

        if (triple) {
            if (MEGA_SYMBOLS.includes(a)) {
                payout = bet * 10;
                message = '🎰 **JACKPOT!** All three matched — you won **10x** your bet!';
            } else {
                payout = bet * 5;
                message = '🎉 **Big Win!** Three matching symbols — you won **5x** your bet!';
            }
        } else if (pair) {
            payout = Math.floor(bet * 1.5);
            message = '✨ **Small Win!** Two matching symbols — you won **1.5x** your bet!';
        } else {
            message = '😢 **Loss!** No matching symbols. Better luck next time!';
        }

        // 3. Credit the payout (the stake was already taken).
        let newWallet = balance;
        if (payout > 0) {
            newWallet = await store.addBalance(userId, payout);
        }

        const embed = new EmbedBuilder()
            .setColor(payout > 0 ? 0x00ff00 : 0xff0000)
            .setTitle('🎰 Casino Slot Machine')
            .setDescription(`│ ${a} │ ${b} │ ${c} │\n\n${message}`)
            .addFields(
                { name: 'Bet', value: money(bet), inline: true },
                { name: 'Payout', value: money(payout), inline: true },
                { name: 'Wallet', value: money(newWallet), inline: true },
            )
            .setTimestamp();

        if (boost) {
            embed.setFooter({ text: `✨ Perk active: your ${boost.label} nudged the reels (+${Math.round(boost.bonus * 100)}%).` });
        }

        return interaction.editReply({ embeds: [embed] });
    },
};
