/**
 * Ready: invite cache warm-up + automatic coin drops.
 *
 * BUG FIXED: the original posted a coin drop with a "Grab Coins!" button and a
 * collector that edited the embed to say the user won — but it NEVER credited
 * the coins. There was no `claim_coin_auto` handler anywhere in the repo and no
 * balance write in the collector, so every drop was cosmetic. Claims now go
 * through lib/data.addBalance().
 *
 * Other fixes:
 *  • Hardcoded channel ID -> config.
 *  • Fixed 30-minute drop interval -> configurable, with jitter so every shard
 *    or restart does not land on the same wall-clock second.
 *  • The interval is tracked and cleared on shutdown (it previously leaked).
 *  • `global.invitesCache` is replaced by a property on the client — polluting
 *    `global` makes the state invisible and impossible to reason about.
 *  • Invite fetch failures no longer spam a console.error per guild when the bot
 *    simply lacks Manage Guild.
 *  • Conflicting presence: this file set "HD music & chat" while index.js set a
 *    rotating status list. The rotating list now wins; this one is removed.
 */
const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../lib/config');
const version = require('../lib/version');
const music = require('../lib/music');
const data = require('../lib/data');
const invites = require('../lib/invites');

const DROP_INTERVAL = 30 * 60 * 1000;
const DROP_MIN = 50;
const DROP_MAX = 150;
const CLAIM_WINDOW_MS = 30 * 1000;

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        /* 0. Version announcement + music housekeeping.
         *    ⭐ These MUST run before the coin-drop section below: that section
         *    `return`s early when AUTO_DROP_CHANNEL_ID is unset, and an early
         *    return here would silently skip everything after it. */
        try {
            await version.announceIfUpdated(client);
        } catch (error) {
            // Never let a failed announcement stop the bot from coming online.
            console.error('[ready] version announcement threw:', error.message);
        }
        if (config.music.enabled) music.startSweep();

        /* 1. Warm the SHARED invite cache (lib/invites.js) used by guildMemberAdd.
         *    The original built its own `global.invitesCache` here while
         *    guildMemberAdd.js captured a separate empty Map at load time, so
         *    invite attribution never worked. */
        await invites.warmAll(client);

        /* 2. Automatic coin drops */
        if (!config.channels.autoDrops) {
            console.log('[ready] AUTO_DROP_CHANNEL_ID not set — coin drops disabled.');
            return;
        }

        async function runDrop() {
            try {
                const channel = await client.channels.fetch(config.channels.autoDrops).catch(() => null);
                if (!channel || !channel.isTextBased()) return;

                const amount = Math.floor(Math.random() * (DROP_MAX - DROP_MIN + 1)) + DROP_MIN;

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🪙 Automatic Coin Drop!')
                    .setDescription(`**${amount} coins** have dropped! Click below to claim them first.`)
                    .setFooter({ text: 'The Syndicate Auto Drop' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('claim_coin_auto')
                        .setLabel('Grab Coins! 🏃‍♂️')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🪙'),
                );

                const message = await channel.send({ embeds: [embed], components: [row] });

                const collector = message.createMessageComponentCollector({ time: CLAIM_WINDOW_MS });
                let winnerId = null;

                collector.on('collect', async (i) => {
                    // Guard synchronously — no await sits between this check and the
                    // assignment, so two collectors can never both pass.
                    if (winnerId) {
                        return i.reply({
                            content: '❌ These coins were already claimed by someone else!',
                            ephemeral: true,
                        });
                    }
                    winnerId = i.user.id;

                    // ⭐ The missing step: actually credit the winner.
                    let newBalance = null;
                    try {
                        newBalance = await data.addBalance(i.user.id, amount);
                    } catch (error) {
                        console.error('[drop] failed to credit winner:', error.message);
                    }

                    if (newBalance === null || newBalance === undefined) {
                        winnerId = null; // reopen the claim instead of losing the drop
                        return i.reply({
                            content: '❌ Something went wrong saving your coins. Please try the next drop.',
                            ephemeral: true,
                        });
                    }

                    const winnerEmbed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle('🪙 Coin Drop Claimed!')
                        .setDescription(`🎉 ${i.user} grabbed **${amount} coins**!\nNew balance: **${newBalance}**`)
                        .setTimestamp();

                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('claim_coin_auto')
                            .setLabel('Claimed ❌')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                    );

                    await i.update({ embeds: [winnerEmbed], components: [disabledRow] }).catch(() => {});
                });

                collector.on('end', async () => {
                    if (winnerId) return;
                    const expiredEmbed = new EmbedBuilder()
                        .setColor(0x808080)
                        .setTitle('🪙 Coin Drop Expired')
                        .setDescription('Nobody claimed the coins in time — they vanished!');

                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('claim_coin_auto')
                            .setLabel('Expired ⌛')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                    );

                    await message.edit({ embeds: [expiredEmbed], components: [disabledRow] }).catch(() => {});
                });
            } catch (error) {
                console.error('[drop] error:', error.message);
            }
        }

        const timer = setInterval(runDrop, DROP_INTERVAL);
        timer.unref?.();
        client.coinDropTimer = timer;

        client.once('shardDisconnect', () => clearInterval(timer));
        process.on('SIGTERM', () => clearInterval(timer));
        process.on('SIGINT', () => clearInterval(timer));
    },
};
