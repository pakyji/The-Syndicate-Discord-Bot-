/**
 * /coinflip — bet on heads or tails.
 *
 * Fix vs. the original: the bet was deducted by mutating a snapshot read at the
 * top of the handler and writing it back at the end (`userProfile.wallet -= bet`).
 * Two concurrent flips both passed the affordability check against the same
 * stale balance, so a user could bet the same coins twice. The stake is now
 * taken atomically with `store.spend()` BEFORE the coin is flipped, and the
 * payout is credited afterwards — so a crash between the two can never create
 * coins out of nothing.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const { Cooldowns } = require('../../lib/cooldowns');
const { MAX_BET, money } = require('../../lib/economy');

const COOLDOWN_MS = 5 * 1000;
const cooldowns = new Cooldowns(COOLDOWN_MS, 10000);

/** Luck-boosting items, best first. */
const BOOSTS = [
    { key: 'lucky_coin', chance: 0.55, label: 'Lucky Coin' },
    { key: 'card_shark_deck', chance: 0.53, label: 'Card Shark Deck' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin to double your bet or lose it')
        .addIntegerOption((option) => option
            .setName('amount')
            .setDescription('Amount to bet')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_BET))
        .addStringOption((option) => option
            .setName('choice')
            .setDescription('Heads or tails')
            .setRequired(true)
            .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),

    category: 'Economy',

    async execute(interaction) {
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger('amount');
        const choice = interaction.options.getString('choice');

        if (!cooldowns.take(userId)) {
            return interaction.reply({
                content: `⏳ Wait **${Math.ceil(cooldowns.remaining(userId) / 1000)}s** before flipping again.`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        // 1. Take the stake atomically.
        const { ok, balance } = await store.spend(userId, bet);
        if (!ok) {
            cooldowns.clear(userId);
            return interaction.editReply({
                content: `❌ Not enough cash. Bet ${money(bet)}, wallet ${money(balance)}.`,
            });
        }

        // 2. Determine the outcome (inventory is read after the stake is safe).
        const inventory = store.getInventory(userId);
        const boost = BOOSTS.find((b) => (Number(inventory[b.key]) || 0) > 0);
        const winChance = boost ? boost.chance : 0.5;

        const won = Math.random() < winChance;
        const result = won ? choice : (choice === 'heads' ? 'tails' : 'heads');

        // 3. Credit the winnings (stake returned + equal profit = 2x bet).
        let newWallet = balance;
        if (won) {
            newWallet = await store.addBalance(userId, bet * 2);
        }

        const embed = new EmbedBuilder()
            .setColor(won ? 0x00ff00 : 0xff0000)
            .setTitle(won ? '🎉 Coinflip: You Won!' : '😢 Coinflip: You Lost!')
            .setDescription(`The coin landed on **${result.toUpperCase()}**.`)
            .addFields(
                { name: 'Your bet', value: money(bet), inline: true },
                { name: 'Your choice', value: choice.toUpperCase(), inline: true },
                { name: 'Outcome', value: won ? `+${money(bet)}` : `-${money(bet)}`, inline: true },
                { name: 'Wallet', value: money(newWallet), inline: false },
            )
            .setTimestamp();

        if (boost) {
            embed.setFooter({ text: `✨ Perk active: your ${boost.label} gave you a slight edge (${Math.round(winChance * 100)}%).` });
        }

        return interaction.editReply({ embeds: [embed] });
    },
};
