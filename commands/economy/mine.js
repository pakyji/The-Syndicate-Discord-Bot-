/**
 * /mine — earn cash and minerals with your best pickaxe.
 *
 * BUG FIXED (command was 100% broken): the cooldown check referenced `now`
 * BEFORE it was declared —
 *
 *     if (cooldowns.has(userId)) {
 *         const expirationTime = cooldowns.get(userId) + cooldownTime;
 *         if (now < expirationTime) { ... }        // <-- `now` not defined yet
 *     }
 *     const now = Date.now();                      // <-- declared afterwards
 *
 * `const` is hoisted into the temporal dead zone, so this threw
 * `ReferenceError: Cannot access 'now' before initialization` and /mine never
 * completed for anyone. (It only reached the TDZ branch once a cooldown existed,
 * so the very first call worked and every later call crashed.)
 *
 * Other fixes:
 *  • Cooldown uses the bounded tracker (was an unbounded Map + one timer/user).
 *  • Balance and inventory writes go through the atomic store, so two /mine
 *    calls in flight can no longer lose one of the rewards.
 *  • Reads the shared catalog in lib/economy.js instead of a private copy.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const store = require('../../lib/data');
const { Cooldowns } = require('../../lib/cooldowns');
const { PICKAXES, COMMON_DROPS, RARE_DROPS, itemName, randomOf, money } = require('../../lib/economy');

const COOLDOWN_MS = 30 * 1000;
const cooldowns = new Cooldowns(COOLDOWN_MS, 10000);

const BARE_HANDS = { min: 10, max: 60, rareChance: 0.05 };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Go mining with your best pickaxe to earn cash and minerals'),

    category: 'Economy',

    async execute(interaction) {
        const userId = interaction.user.id;

        // Correct cooldown ordering: check first, then stamp.
        if (cooldowns.has(userId)) {
            const wait = Math.ceil(cooldowns.remaining(userId) / 1000);
            return interaction.reply({
                content: `⏳ You are exhausted! Mine again in **${wait}s**.`,
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const inventory = store.getInventory(userId);

        // Best pickaxe owned (PICKAXES is ordered best-first).
        const active = PICKAXES.find((p) => (Number(inventory[p.key]) || 0) > 0) || null;

        const range = active
            ? { min: active.minReward, max: active.maxReward, rareChance: active.rareChance }
            : BARE_HANDS;

        const cashEarned = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
        const foundItem = Math.random() < range.rareChance
            ? randomOf(RARE_DROPS)
            : randomOf(COMMON_DROPS);

        // Stamp the cooldown only after the work succeeded.
        cooldowns.take(userId);

        // Single atomic update: cash and item land together or not at all.
        const res = await store.updateUser(userId, (u) => {
            u.wallet = (Number(u.wallet) || 0) + cashEarned;
            if (!u.inventory || typeof u.inventory !== 'object') u.inventory = {};
            u.inventory[foundItem] = (Number(u.inventory[foundItem]) || 0) + 1;
        });

        if (!res.ok) {
            cooldowns.clear(userId);
            return interaction.editReply({ content: '❌ Could not save your mining results. Please try again.' });
        }

        const embed = new EmbedBuilder()
            .setColor(0xcd7f32)
            .setTitle('⛏️ Mining Expedition Successful!')
            .setDescription(
                active
                    ? `You descended into the mines with your **${active.name}** and dug deep into the bedrock.`
                    : 'You had no pickaxe, so you dug with **bare hands**. Buy one with `/shop`!',
            )
            .addFields(
                { name: '💰 Cash Earned', value: `+${money(cashEarned)}`, inline: true },
                { name: '🎁 Mineral Found', value: `x1 ${itemName(foundItem)}`, inline: true },
                { name: '👛 Wallet', value: money(store.getWallet(userId)), inline: true },
            )
            .setFooter({ text: 'Tip: better pickaxes earn far more cash and rare gems.' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },
};
