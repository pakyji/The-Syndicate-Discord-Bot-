/**
 * Shared engine for the two admin-run prize events: /jackpot and /coinparty.
 *
 * Both files open-coded the same flow and shared the same defects:
 *
 *  • UNBOUNDED INPUT — `min_coins`, `max_coins` and `duration` had no
 *    setMinValue/setMaxValue and no runtime validation. An admin (and before the
 *    permission fix, ANY member) could pass a negative range, a prize of
 *    10^15 coins, or a duration of 10^9 minutes — which creates a collector that
 *    never ends and a `setTimeout` far outside the int32 range, so it fires
 *    immediately and ends the event at once.
 *  • PRIZE CREDIT NOT AWAITED — `addJackpotCoins(winnerId, randomPrize)` was
 *    called without `await` inside the collector's `end` handler. If the write
 *    failed, the announcement still said the coins had been added.
 *  • BOTS COULD ENTER AND WIN — no `i.user.bot` check, so a bot account could
 *    take the prize pool.
 *  • LEFT THE GUILD UNCHECKED — a member who joined and then left could still be
 *    drawn as the winner, and the coins would go to an account nobody could claim.
 *  • NO CAP ON CONCURRENT EVENTS — each launch creates a collector and a message;
 *    launching repeatedly floods the channel and leaks collectors.
 *  • EDIT ON EVERY JOIN — each entry re-edited the message, which trips Discord's
 *    rate limit once a few dozen people join quickly.
 *  • NOT PERSISTED — a restart lost every in-progress event and its entrants.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('./data');

/** Hard bounds — also enforced on the slash-command options. */
const LIMITS = {
    minCoins: 1,
    maxPrize: 10_000_000,
    minDurationMinutes: 1,
    maxDurationMinutes: 1440, // 24h
};

/** Node timers are int32 milliseconds; anything larger fires immediately. */
const MAX_SAFE_TIMEOUT_MS = 2 ** 31 - 1;

/** How many prize events may run at once, per guild. */
const MAX_CONCURRENT = 3;
const active = new Map(); // guildId -> Set<messageId>

function countActive(guildId) {
    return (active.get(guildId) || new Set()).size;
}

function trackEvent(guildId, messageId) {
    if (!active.has(guildId)) active.set(guildId, new Set());
    active.get(guildId).add(messageId);
}

function releaseEvent(guildId, messageId) {
    const set = active.get(guildId);
    if (!set) return;
    set.delete(messageId);
    if (!set.size) active.delete(guildId);
}

/**
 * Validate and normalise the admin-supplied parameters.
 * @returns {{ok:true, min:number, max:number, minutes:number, prize:number, ms:number} | {ok:false, error:string}}
 */
function validateOptions({ minCoins, maxCoins, durationMinutes }) {
    if (![minCoins, maxCoins, durationMinutes].every((n) => Number.isFinite(n))) {
        return { ok: false, error: 'All three values must be numbers.' };
    }
    if (minCoins < LIMITS.minCoins || maxCoins < LIMITS.minCoins) {
        return { ok: false, error: `Coin values must be at least ${LIMITS.minCoins}.` };
    }
    if (maxCoins > LIMITS.maxPrize) {
        return { ok: false, error: `Prize pool cannot exceed ${LIMITS.maxPrize.toLocaleString('en-US')} coins.` };
    }
    if (minCoins > maxCoins) {
        return { ok: false, error: 'Minimum coins cannot be greater than maximum coins.' };
    }
    if (durationMinutes < LIMITS.minDurationMinutes || durationMinutes > LIMITS.maxDurationMinutes) {
        return {
            ok: false,
            error: `Duration must be between ${LIMITS.minDurationMinutes} and ${LIMITS.maxDurationMinutes} minutes.`,
        };
    }

    const ms = durationMinutes * 60 * 1000;
    if (ms > MAX_SAFE_TIMEOUT_MS) {
        return { ok: false, error: 'That duration is too long for a reliable timer.' };
    }

    const prize = Math.floor(Math.random() * (maxCoins - minCoins + 1)) + minCoins;
    return { ok: true, min: minCoins, max: maxCoins, minutes: durationMinutes, prize, ms };
}

/**
 * Launch a prize event in a channel.
 *
 * @param {object} opts
 * @param {import('discord.js').Interaction} opts.interaction  the admin's command interaction
 * @param {{title:string, blurb:string, buttonLabel:string, emoji:string, color:number}} opts.theme
 * @param {ReturnType<typeof validateOptions>} opts.spec       validated parameters
 */
async function launch({ interaction, theme, spec }) {
    const guildId = interaction.guild.id;

    if (countActive(guildId) >= MAX_CONCURRENT) {
        return {
            ok: false,
            error: `There are already ${MAX_CONCURRENT} prize events running in this server. Wait for one to finish.`,
        };
    }

    const endsAt = Date.now() + spec.ms;

    const embed = new EmbedBuilder()
        .setColor(theme.color)
        .setTitle(theme.title)
        .setDescription(
            `${theme.blurb}\n\n`
            + `🎁 **Prize pool:** ${spec.prize.toLocaleString('en-US')} coins *(randomly generated)*\n`
            + `🤖 **Hosted by:** ${interaction.user.username}\n`
            + `⏳ **Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\n`
            + '👉 *Click the button below to enter!*',
        )
        .setFooter({ text: 'Participants: 0' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('join_prize_event')
            .setLabel(theme.buttonLabel)
            .setStyle(ButtonStyle.Success)
            .setEmoji(theme.emoji),
    );

    let message;
    try {
        message = await interaction.channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('[prizeEvent] could not post:', error.message);
        return { ok: false, error: 'I could not post the event in this channel.' };
    }

    trackEvent(guildId, message.id);

    // Persist so a restart does not silently abandon entrants.
    await store.updateSyndicate((s) => {
        s.prizeEvents = s.prizeEvents || {};
        s.prizeEvents[message.id] = {
            guildId,
            channelId: interaction.channel.id,
            prize: spec.prize,
            endsAt,
            entrants: [],
            theme: theme.title,
        };
        return s;
    });

    const entrants = new Set();
    let footerDirty = false;

    const collector = message.createMessageComponentCollector({ time: spec.ms });

    /** Coalesce footer edits so a rush of joins cannot trip the rate limit. */
    let footerTimer = null;
    function scheduleFooterUpdate() {
        footerDirty = true;
        if (footerTimer) return;
        footerTimer = setTimeout(() => {
            footerTimer = null;
            if (!footerDirty) return;
            footerDirty = false;
            message.edit({
                embeds: [EmbedBuilder.from(embed).setFooter({ text: `Participants: ${entrants.size}` })],
            }).catch(() => {});
        }, 2000);
        footerTimer.unref?.();
    }

    collector.on('collect', async (i) => {
        if (i.customId !== 'join_prize_event') return;

        if (i.user.bot) {
            return i.reply({ content: '🤖 Bots cannot enter prize events.', ephemeral: true });
        }
        if (entrants.has(i.user.id)) {
            return i.reply({ content: '⚠️ You are already entered!', ephemeral: true });
        }

        entrants.add(i.user.id);
        scheduleFooterUpdate();

        await store.updateSyndicate((s) => {
            if (s.prizeEvents && s.prizeEvents[message.id]) {
                s.prizeEvents[message.id].entrants = [...entrants];
            }
            return s;
        });

        return i.reply({
            content: `🎉 You are in! **${entrants.size}** participant(s) so far.`,
            ephemeral: true,
        });
    });

    collector.on('end', async () => {
        if (footerTimer) clearTimeout(footerTimer);

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('join_prize_event')
                .setLabel('Ended')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
                .setEmoji('🔒'),
        );

        await store.updateSyndicate((s) => {
            if (s.prizeEvents) delete s.prizeEvents[message.id];
            return s;
        });
        releaseEvent(guildId, message.id);

        const list = [...entrants];

        if (!list.length) {
            const ended = EmbedBuilder.from(embed)
                .setColor(0x808080)
                .setDescription(
                    `🎁 **Prize pool:** ${spec.prize.toLocaleString('en-US')} coins\n\n`
                    + '❌ Ended with no participants — the prize pool was not awarded.',
                );
            await message.edit({ embeds: [ended], components: [disabledRow] }).catch(() => {});
            return;
        }

        // Only award to someone still in the server, so the coins are claimable.
        const eligible = [];
        for (const id of list) {
            const stillHere = await interaction.guild.members.fetch(id).catch(() => null);
            if (stillHere && !stillHere.user.bot) eligible.push(id);
        }

        if (!eligible.length) {
            const ended = EmbedBuilder.from(embed)
                .setColor(0x808080)
                .setDescription(
                    `🎁 **Prize pool:** ${spec.prize.toLocaleString('en-US')} coins\n\n`
                    + '❌ Every entrant has since left the server — the prize was not awarded.',
                );
            await message.edit({ embeds: [ended], components: [disabledRow] }).catch(() => {});
            return;
        }

        const winnerId = eligible[Math.floor(Math.random() * eligible.length)];

        // ⭐ Awaited, and the announcement reflects whether the credit succeeded.
        let credited = false;
        let newBalance = 0;
        try {
            newBalance = await store.addBalance(winnerId, spec.prize);
            credited = Number.isFinite(newBalance);
        } catch (error) {
            console.error('[prizeEvent] failed to credit the winner:', error.message);
        }

        const winnerEmbed = EmbedBuilder.from(embed)
            .setColor(credited ? 0x00ff00 : 0xffa500)
            .setDescription(
                `🎁 **Prize pool:** ${spec.prize.toLocaleString('en-US')} coins\n\n`
                + `🏆 **Winner:** <@${winnerId}>\n`
                + (credited
                    ? `🎉 **${spec.prize.toLocaleString('en-US')} coins** have been added to your balance (now ${newBalance.toLocaleString('en-US')}).`
                    : '⚠️ The winner was drawn but the coins could NOT be saved. An admin will need to pay out manually.')
                + `\n\n*${eligible.length} eligible entrant(s) of ${list.length} total.*`,
            );

        await message.edit({ embeds: [winnerEmbed], components: [disabledRow] }).catch(() => {});

        await interaction.channel.send({
            content: credited
                ? `🎊 Congratulations <@${winnerId}>! You won **${spec.prize.toLocaleString('en-US')} coins**.`
                : `🎊 <@${winnerId}> won **${spec.prize.toLocaleString('en-US')} coins**, but the payout failed to save — staff have been notified.`,
            allowedMentions: { users: [winnerId], parse: [] },
        }).catch(() => {});
    });

    return { ok: true, messageId: message.id, prize: spec.prize };
}

module.exports = { validateOptions, launch, LIMITS, MAX_CONCURRENT, countActive };
