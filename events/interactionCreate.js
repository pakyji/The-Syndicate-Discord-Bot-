/**
 * Central interaction router (buttons, select menus, modals, slash commands).
 *
 * Fixes vs. the original:
 *  ⭐ PERMISSION GATE — the slash-command router called `command.execute()` with
 *     no runtime permission check. Combined with index.js dropping
 *     `default_member_permissions` at registration, EVERY member could run
 *     /ban, /dm, /announcement, /antilink and 14 others. Now `perms.gateCommand()`
 *     runs before dispatch.
 *  ⭐ GIVEAWAY ESCALATION — the `secure_giveaway_modal` submit handler was only
 *     reachable from the /giveaway command, but the handler itself never
 *     re-verified that the submitter was an admin. Custom IDs are user-supplied
 *     data, so this re-checks Administrator on submit.
 *  ⭐ GIVEAWAY VERIFICATION BYPASS — `if (verifiedRole && !member.roles.has(...))`
 *     meant that when the Verified role did not exist the check was skipped
 *     entirely and ANYONE could enter. Now a missing role is a hard fail.
 *  • Hardcoded channel IDs, role names and STAFF_IDS moved to lib/config.js.
 *  • Roles resolved by ID (lib/roles.js) instead of by name — a decoy role named
 *    "Verified" no longer passes verification or earns coins.
 *  • Raw `error.message` is no longer echoed back to the user (info leak);
 *    the detail is logged server-side and redacted.
 *  • The MyMemory axios call now has a timeout and a null-guard. Previously
 *    `transRes.data.responseData.translatedText` threw a TypeError whenever the
 *    anonymous daily quota was exceeded — and the catch then posted the
 *    *untranslated* embed, so the translation call was wasted work.
 *  • `userSelections` was an unbounded Map that was only cleaned on the happy
 *    path; it now expires entries and is capped.
 *  • The verify-channel deletion `setTimeout` is tracked and cleared on shutdown.
 *  • The whole file was one 513-line function; handlers are now separated into
 *    named functions so a failure in one is attributable.
 */
const { Events, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits, } = require('discord.js');
const axios = require('axios');

const config = require('../lib/config');
const perms = require('../lib/perms');
const { parseGiveawayDuration, describeDurationLimits, GIVEAWAY_LIMITS } = require('../lib/duration');
const roles = require('../lib/roles');
const data = require('../lib/data');
const { formatError } = require('../lib/logger');
const music = require('../lib/music');

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

/* ------------------------------------------------------------------ *
 * GTA SOS state — bounded, expiring
 * ------------------------------------------------------------------ */
const SOS_TTL_MS = 15 * 60 * 1000;
const SOS_MAX_ENTRIES = 2000;
const userSelections = new Map(); // userId -> { category, platform, at }

function setSelection(userId, patch) {
    const existing = userSelections.get(userId) || {};
    userSelections.set(userId, { ...existing, ...patch, at: Date.now() });
    pruneSelections();
}

function getSelection(userId) {
    const entry = userSelections.get(userId);
    if (!entry) return { category: 'General', platform: 'Unknown' };
    if (Date.now() - (entry.at || 0) > SOS_TTL_MS) {
        userSelections.delete(userId);
        return { category: 'General', platform: 'Unknown' };
    }
    return entry;
}

function pruneSelections() {
    const now = Date.now();
    for (const [id, entry] of userSelections) {
        if (now - (entry.at || 0) > SOS_TTL_MS) userSelections.delete(id);
    }
    while (userSelections.size > SOS_MAX_ENTRIES) {
        const oldest = userSelections.keys().next().value;
        userSelections.delete(oldest);
    }
}

/* ------------------------------------------------------------------ *
 * Platform reaction roles
 * ------------------------------------------------------------------ */
const ROLE_BUTTONS = {
    ps4: 'PS4',
    ps5: 'PS5',
    pc: 'PC',
    pc_enhanced: 'PC Enhanced',
    xbox: 'X Box Series',
    switch: 'Switch',
    mobile: 'Mobile User',
    nongamer: 'Non Gamer',
};

async function handleReactionRole(interaction) {
    const key = interaction.customId.replace('role_', '');
    const roleName = ROLE_BUTTONS[key];
    if (!roleName) return true;

    // Resolve by name, but DO NOT auto-create: letting any button press spawn
    // roles clutters the role list and is hard to audit.
    const role = roles.findByName(interaction.guild, roleName);
    if (!role) {
        return interaction.reply({
            content: `⚠️ The **${roleName}** role does not exist yet. Ask an admin to create it (or run \`/reactionroles\`).`,
            ephemeral: true,
        });
    }

    const member = interaction.member;
    try {
        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role.id, 'Self-service reaction role');
            return interaction.reply({ content: `❌ Removed **${role.name}** from you.`, ephemeral: true });
        }
        // Never let a member self-assign a role at/above the bot's highest role.
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
                content: `⚠️ I cannot assign **${role.name}** — it is at or above my highest role.`,
                ephemeral: true,
            });
        }
        if (role.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: `⚠️ Refusing to self-assign **${role.name}**: it has Administrator.`,
                ephemeral: true,
            });
        }
        await member.roles.add(role.id, 'Self-service reaction role');
        return interaction.reply({ content: `✅ Added **${role.name}** to you.`, ephemeral: true });
    } catch (error) {
        console.error('[reactionRole]', error.message);
        return interaction.reply({
            content: '⚠️ Failed to update your roles. My role must be positioned above the target role.',
            ephemeral: true,
        });
    }
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */
async function handleVerifyButton(interaction) {
    const platformKey = interaction.customId.replace('verify_', '');
    const role = await roles.getVerifiedRole(interaction.guild);

    if (!role) {
        return interaction.reply({
            content: '⚠️ Verification is not configured on this server (no Verified role). Please contact a moderator.',
            ephemeral: true,
        });
    }
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.reply({
            content: '⚠️ My highest role is not above the Verified role, so I cannot verify you. Ask an admin to move my role up.',
            ephemeral: true,
        });
    }

    if (platformKey === 'nongamer') {
        if (!interaction.member.roles.cache.has(role.id)) {
            await interaction.member.roles.add(role.id, 'Self-verification (non-gamer)');
        }
        return closeVerifyChannel(interaction, '✅ Verified successfully!');
    }

    const modal = new ModalBuilder()
        .setCustomId(`modal_${platformKey}`)
        .setTitle(`Enter your ${platformKey.toUpperCase()} ID`);

    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
            .setCustomId('gamertag_input')
            .setLabel('Gamertag ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type your ID here...')
            .setMaxLength(64)
            .setRequired(true),
    ));

    return interaction.showModal(modal);
}

async function handleVerifyModal(interaction) {
    const platformKey = interaction.customId.replace('modal_', '');
    const platformName = platformKey.toUpperCase();
    const gamertagId = interaction.fields.getTextInputValue('gamertag_input').slice(0, 64);

    const role = await roles.getVerifiedRole(interaction.guild);
    if (!role) {
        return interaction.reply({
            content: '⚠️ Verification is not configured on this server (no Verified role).',
            ephemeral: true,
        });
    }

    if (!interaction.member.roles.cache.has(role.id)) {
        try {
            await interaction.member.roles.add(role.id, `Self-verification (${platformName})`);
        } catch (error) {
            console.error('[verify] role add failed:', error.message);
            return interaction.reply({
                content: '⚠️ Could not assign the Verified role. Check my role position.',
                ephemeral: true,
            });
        }
    }

    // Post the ID card to the platform channel.
    const channelMap = { ps4: config.channels.ps4, ps5: config.channels.ps5, pc: config.channels.pc };
    const targetId = channelMap[platformKey];
    if (targetId) {
        const targetChannel = interaction.guild.channels.cache.get(targetId);
        if (targetChannel && targetChannel.isTextBased()) {
            const idCard = new EmbedBuilder()
                .setColor('#2b2d31')
                .setDescription(
                    `User: **${interaction.user.username}** (${interaction.user})\n`
                    + `Platform: **${platformName}**\nGamertag ID:\n**${gamertagId}**`,
                )
                .setTimestamp();
            await targetChannel.send({ embeds: [idCard] }).catch(() => {});
        }
    }

    return closeVerifyChannel(interaction, '✅ Verified successfully!');
}

/** Reply, then delete the temporary verify- channel (timer tracked + cleared on shutdown). */
async function closeVerifyChannel(interaction, message) {
    const isVerifyChannel = interaction.channel && interaction.channel.name.startsWith('verify-');
    if (!isVerifyChannel) {
        return interaction.reply({ content: message, ephemeral: true });
    }

    await interaction.reply({ content: `${message} Channel will close shortly.`, ephemeral: true });

    const channel = interaction.channel;
    const timer = setTimeout(() => {
        pendingDeletes.delete(timer);
        channel.delete('Verification complete').catch(() => {});
    }, 5000);
    timer.unref?.();
    pendingDeletes.add(timer);
}

const pendingDeletes = new Set();
process.on('exit', () => { for (const t of pendingDeletes) clearTimeout(t); });

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */
const REPORT_TITLES = {
    report_scammer: 'Report a Scammer',
    report_rule: 'Report Server Rule Violation',
    report_dm: 'Report DM Advertising',
};

async function handleReportSelect(interaction) {
    const selected = interaction.values[0];
    const title = REPORT_TITLES[selected] || 'Report Form';

    const modal = new ModalBuilder().setCustomId(`report_modal_${selected}`).setTitle(title);

    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId('suspect_input')
            .setLabel('Suspect username / ID / profile link')
            .setPlaceholder('e.g. username or User ID')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId('evidence_input')
            .setLabel('Evidence (image/video or message link)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Paste a screenshot or message link')
            .setMaxLength(300)
            .setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId('description_input')
            .setLabel('Explain what happened')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('A brief summary of the violation...')
            .setMaxLength(1000)
            .setRequired(true)),
    );

    return interaction.showModal(modal);
}

async function handleReportModal(interaction, client) {
    const suspect = interaction.fields.getTextInputValue('suspect_input');
    const evidence = interaction.fields.getTextInputValue('evidence_input');
    const details = interaction.fields.getTextInputValue('description_input');
    const reportType = interaction.customId.replace('report_modal_', '');

    const categoryName = {
        report_scammer: '🚨 Scammer Report',
        report_rule: '⚠️ Rule Violation',
        report_dm: '📢 DM Advertising',
    }[reportType] || 'General Report';

    const guildName = interaction.guild ? interaction.guild.name : 'DM';

    const reportEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle(`New Report: ${categoryName}`)
        .addFields(
            { name: '👤 Reporter', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: false },
            { name: '🎯 Suspect', value: suspect.slice(0, 1024), inline: false },
            { name: '🔗 Evidence', value: evidence.slice(0, 1024), inline: false },
            { name: '📝 Description', value: details.slice(0, 1024), inline: false },
        )
        .setTimestamp();

    await interaction.deferReply({ ephemeral: true });

    // Deliver to configured staff. Failures are counted, not fatal.
    let delivered = 0;
    for (const staffId of config.staffIds) {
        try {
            const staffUser = await client.users.fetch(staffId);
            if (!staffUser) continue;
            await staffUser.send({ content: `🚨 **New report in ${guildName}:**`, embeds: [reportEmbed] });
            delivered += 1;
        } catch (error) {
            // DMs closed is the common case — log at debug level, not error.
            console.warn(`[report] could not DM staff ${staffId}: ${error.message}`);
        }
    }

    // Also mirror to the report channel so a report is never lost if all DMs fail.
    if (config.channels.report && interaction.guild) {
        const channel = interaction.guild.channels.cache.get(config.channels.report)
            || await interaction.guild.channels.fetch(config.channels.report).catch(() => null);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [reportEmbed] }).catch(() => {});
            delivered += 1;
        }
    }

    if (delivered === 0) {
        return interaction.editReply({
            content: '❌ Your report could not be delivered (no staff DMs reachable and no report channel configured). Please ping a moderator directly.',
        });
    }

    await interaction.user.send({
        embeds: [new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Report submitted')
            .setDescription(`Your report about **${suspect.slice(0, 100)}** in **${guildName}** reached the moderation team.\n\nThank you for keeping the community safe.`)
            .setTimestamp()],
    }).catch(() => {});

    return interaction.editReply({
        content: '✅ Your report has been sent to the moderation team, and a confirmation DM was sent to you.',
    });
}

/* ------------------------------------------------------------------ *
 * Giveaways
 * ------------------------------------------------------------------ */
// Duration parsing moved to lib/duration.js (it was duplicated in giveaway.js).

async function handleGiveawayModal(interaction) {
    // ⭐ customId is user-supplied — re-verify the submitter is an admin.
    if (!(await perms.requirePermission(interaction, PermissionFlagsBits.Administrator, 'Administrator'))) {
        return;
    }

    const prize = interaction.fields.getTextInputValue('gw_prize').slice(0, 100);
    const durationStr = interaction.fields.getTextInputValue('gw_duration');
    const hostName = interaction.fields.getTextInputValue('gw_host').slice(0, 50);
    const minInvitesRaw = interaction.fields.getTextInputValue('gw_min_invites');
    const customMsg = (interaction.fields.getTextInputValue('gw_message') || 'Click the button below to join!').slice(0, 1000);

    const ms = parseGiveawayDuration(durationStr);
    if (!ms) {
        return interaction.reply({
            content: `❌ Invalid duration \`${durationStr}\`. Use \`10s\`, \`5m\`, \`2h\` or \`1d\` (${describeDurationLimits(GIVEAWAY_LIMITS)}).`,
            ephemeral: true,
        });
    }

    const minInvites = Math.max(0, Math.min(1000, parseInt(minInvitesRaw, 10) || 0));
    const endsAt = Date.now() + ms;

    const targetChannel = interaction.guild.channels.cache.get(config.channels.giveaway)
        || await interaction.guild.channels.fetch(config.channels.giveaway).catch(() => null);

    if (!targetChannel || !targetChannel.isTextBased()) {
        return interaction.reply({
            content: '❌ Giveaway channel not found. Set `GIVEAWAY_CHANNEL_ID` in `.env`.',
            ephemeral: true,
        });
    }

    const reqsText = [];
    if (minInvites > 0) reqsText.push(`• Minimum invites: **${minInvites}**`);
    reqsText.push(`• Required role: **${config.roles.verifiedName}**`);

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎉 GIVEAWAY 🎉')
        .setDescription(
            `**Prize:** ${prize}\n**Host:** ${hostName}\n`
            + `**Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\n💬 *${customMsg}*\n\n`
            + `🔒 **Requirements:**\n${reqsText.join('\n')}`,
        )
        .setFooter({ text: `Started by ${interaction.user.tag}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join_secure_gw').setLabel('Join Giveaway').setStyle(ButtonStyle.Success).setEmoji('🎉'),
    );

    await interaction.reply({ content: `✅ Giveaway launched in ${targetChannel}!`, ephemeral: true });

    const giveawayMessage = await targetChannel.send({ embeds: [embed], components: [row] });

    // Persist so an in-progress giveaway survives a restart.
    await data.updateSyndicate((s) => {
        s.activeGiveaway = {
            messageId: giveawayMessage.id,
            channelId: targetChannel.id,
            guildId: interaction.guild.id,
            prize,
            hostName,
            minInvites,
            endsAt,
            entrants: [],
        };
        return s;
    });

    const entrants = new Set();
    const collector = giveawayMessage.createMessageComponentCollector({ time: ms });

    collector.on('collect', async (i) => {
        if (i.customId !== 'join_secure_gw') return;

        if (i.user.bot) {
            return i.reply({ content: '❌ Bots cannot enter.', ephemeral: true });
        }

        // ⭐ Hard fail when the role is missing — the original skipped the check
        //    entirely in that case, letting anyone enter.
        const verifiedRole = await roles.getVerifiedRole(i.guild);
        if (!verifiedRole) {
            return i.reply({
                content: '❌ This giveaway requires the Verified role, but the server has none configured. Ask a moderator.',
                ephemeral: true,
            });
        }
        if (!i.member.roles.cache.has(verifiedRole.id)) {
            return i.reply({ content: `❌ You need the **${verifiedRole.name}** role to enter.`, ephemeral: true });
        }

        if (minInvites > 0) {
            let total = 0;
            try {
                const guildInvites = await i.guild.invites.fetch();
                total = guildInvites
                    .filter((inv) => inv.inviter && inv.inviter.id === i.user.id)
                    .reduce((sum, inv) => sum + inv.uses, 0);
            } catch (error) {
                return i.reply({
                    content: '❌ I could not verify your invite count (missing Manage Guild). Ask a moderator.',
                    ephemeral: true,
                });
            }
            if (total < minInvites) {
                return i.reply({
                    content: `❌ You need at least **${minInvites}** invites — you have **${total}**.`,
                    ephemeral: true,
                });
            }
        }

        if (entrants.has(i.user.id)) {
            return i.reply({ content: '⚠️ You have already entered.', ephemeral: true });
        }

        entrants.add(i.user.id);
        await data.updateSyndicate((s) => {
            if (s.activeGiveaway && s.activeGiveaway.messageId === giveawayMessage.id) {
                s.activeGiveaway.entrants = [...entrants];
            }
            return s;
        });

        return i.reply({
            content: `✅ Entered! **${entrants.size}** participant(s) so far.`,
            ephemeral: true,
        });
    });

    collector.on('end', async () => {
        const list = [...entrants];
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join_secure_gw').setLabel('Giveaway Ended')
                .setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji('🔒'),
        );

        await data.updateSyndicate((s) => { s.activeGiveaway = null; return s; });

        if (!list.length) {
            const ended = EmbedBuilder.from(embed)
                .setDescription(`**Prize:** ${prize}\n\n❌ Ended with no valid participants.`);
            await giveawayMessage.edit({ embeds: [ended], components: [disabledRow] }).catch(() => {});
            return;
        }

        const winnerId = list[Math.floor(Math.random() * list.length)];
        const winnerEmbed = EmbedBuilder.from(embed)
            .setDescription(`**Prize:** ${prize}\n\n🏆 **Winner:** <@${winnerId}>\nParticipants: ${list.length}`);

        await giveawayMessage.edit({ embeds: [winnerEmbed], components: [disabledRow] }).catch(() => {});
        await targetChannel.send({
            content: `🎉 Congratulations <@${winnerId}>! You won **${prize}**!`,
            allowedMentions: { users: [winnerId], parse: [] },
        }).catch(() => {});
    });
}

/* ------------------------------------------------------------------ *
 * GTA SOS / LFG
 * ------------------------------------------------------------------ */
const GTA_CATEGORIES = [
    { label: 'Cayo Perico Heist', value: 'cayo_perico', description: 'Setups and finale help' },
    { label: 'Diamond Casino Heist', value: 'casino_heist', description: 'Vault approach, preps & finale' },
    { label: 'The Doomsday Heist', value: 'doomsday', description: 'Act 1, 2, 3 setups & missions' },
    { label: 'Classic Heists', value: 'classic_heists', description: 'Fleeca, Prison Break, Pacific Standard' },
    { label: 'General Businesses / Sell', value: 'businesses', description: 'Bunker, MC, Nightclub sales or supplies' },
    { label: 'Free Roam / CEO Work', value: 'free_roam', description: 'VIP work, Client jobs, CEO missions' },
    { label: 'LS Tuners / Contracts', value: 'ls_tuners', description: 'Auto Shop contracts & street races' },
    { label: 'Salvage Yard & Cluckin Bell', value: 'salvage_yard', description: 'Robberies and raid setups' },
];

async function handleSosStart(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('gta_category_select')
            .setPlaceholder('📂 Choose a GTA activity / heist category')
            .addOptions(GTA_CATEGORIES),
    );

    return interaction.reply({
        content: '🎯 **Select the GTA activity you need help with:**',
        components: [row],
        ephemeral: true,
    });
}

async function handleCategorySelect(interaction) {
    const category = interaction.values[0];
    setSelection(interaction.user.id, { category });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('gta_platform_select')
            .setPlaceholder('🎮 Select your gaming platform')
            .addOptions([
                { label: 'PlayStation 4 (PS4)', value: 'PS4', emoji: '🎮' },
                { label: 'PlayStation 5 (PS5)', value: 'PS5', emoji: '🎮' },
                { label: 'PC', value: 'PC', emoji: '🖥️' },
                { label: 'Xbox (One / Series X|S)', value: 'Xbox', emoji: '🕹️' },
            ]),
    );

    return interaction.update({
        content: `✅ Category: **${category.replace(/_/g, ' ').toUpperCase()}**\n\nNow select your **platform**:`,
        components: [row],
    });
}

async function handlePlatformSelect(interaction) {
    setSelection(interaction.user.id, { platform: interaction.values[0] });

    const modal = new ModalBuilder().setCustomId('gta_note_modal').setTitle('📝 Add an optional note');
    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
            .setCustomId('user_custom_note')
            .setLabel('Details (mic, player count, etc.)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g. need 2 more players, mic required, hard mode...')
            .setRequired(false)
            .setMaxLength(250),
    ));

    return interaction.showModal(modal);
}

async function translateToItalian(text) {
    try {
        const res = await axios.get(MYMEMORY_URL, {
            params: { q: text, langpair: 'en|it' },
            timeout: config.translation.requestTimeoutMs,
            headers: { 'User-Agent': 'TheSyndicateBot/2.0 (discord.js)' },
            validateStatus: () => true,
        });
        const body = res.data;
        if (!body || body.responseStatus !== 200) return null;
        const out = body.responseData && body.responseData.translatedText;
        return typeof out === 'string' && out ? out : null;
    } catch (error) {
        console.warn('[sos] translation failed:', error.message);
        return null;
    }
}

async function handleNoteModal(interaction) {
    const customNote = (interaction.fields.getTextInputValue('user_custom_note') || '').slice(0, 250)
        || 'No additional notes provided.';
    const selection = getSelection(interaction.user.id);
    const category = String(selection.category || 'General').replace(/_/g, ' ').toUpperCase();
    const platform = selection.platform || 'Unknown';

    await interaction.reply({
        content: '🎉 **SOS request submitted to the LFG channels!**',
        ephemeral: true,
    });

    const buildEmbed = (title, color, activityLabel, platformLabel, noteLabel, cta) => new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(
            `${title}\n\n👤 **User:** ${interaction.user}\n`
            + `🎯 **${activityLabel}:** ${category}\n🎮 **${platformLabel}:** ${platform}\n`
            + `💬 **${noteLabel}:** ${customNote}\n\n*${cta}*`,
        )
        .setTimestamp();

    const guild = interaction.guild;

    const mainChannel = guild.channels.cache.get(config.channels.lfgMain)
        || await guild.channels.fetch(config.channels.lfgMain).catch(() => null);
    if (mainChannel && mainChannel.isTextBased()) {
        const en = buildEmbed('🚨 GTA V SOS Alert', '#00FF00', 'Activity', 'Platform', 'Note',
            'React or message the user to join the crew!');
        await mainChannel.send({ embeds: [en] }).catch(() => {});
    }

    const italianChannel = guild.channels.cache.get(config.channels.lfgItalian)
        || await guild.channels.fetch(config.channels.lfgItalian).catch(() => null);
    if (italianChannel && italianChannel.isTextBased()) {
        const translatedNote = await translateToItalian(customNote);
        const it = new EmbedBuilder()
            .setColor('#00AAFF')
            .setTitle('🚨 Avviso SOS GTA V')
            .setDescription(
                `🚨 **Nuova richiesta SOS GTA LFG!**\n\n👤 **Utente:** ${interaction.user}\n`
                + `🎯 **Attività:** ${category}\n🎮 **Piattaforma:** ${platform}\n`
                + `💬 **Nota:** ${translatedNote || customNote}\n\n`
                + `*Reagisci o scrivi all'utente per unirti alla crew!*`,
            )
            .setTimestamp();
        await italianChannel.send({ embeds: [it] }).catch(() => {});
    }

    userSelections.delete(interaction.user.id);
}

/* ------------------------------------------------------------------ *
 * Music transport buttons (attached to the now-playing embed)
 * ------------------------------------------------------------------ */
/**
 * Same gate as the slash commands: the clicker must be in the voice channel the
 * player is actually in. Without it, anyone could scroll back to an old
 * now-playing message and stop the room's audio from a channel they are not in —
 * and because custom IDs are user-supplied, the gate cannot live in the button.
 */
async function handleMusicButton(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({ content: '❌ Music only works inside a server.', ephemeral: true });
    }

    const queue = music.getQueue(interaction.guildId);
    if (!queue || (!queue.current && !queue.tracks.length)) {
        return interaction.reply({ content: '🔇 Nothing is playing any more.', ephemeral: true });
    }

    const channel = interaction.member?.voice?.channel;
    if (!channel || (queue.voiceChannelId && channel.id !== queue.voiceChannelId)) {
        return interaction.reply({
            content: `❌ Join <#${queue.voiceChannelId}> to control the player.`,
            ephemeral: true,
        });
    }

    switch (interaction.customId) {
        case 'music_pause': {
            // One button toggles, so it stays useful while paused.
            if (music.pause(queue)) return interaction.reply({ content: '⏸️ Paused.', ephemeral: true });
            if (music.resume(queue)) return interaction.reply({ content: '▶️ Resumed.', ephemeral: true });
            return interaction.reply({ content: '⚠️ The player is not in a pausable state.', ephemeral: true });
        }
        case 'music_skip': {
            const was = music.skip(queue);
            return interaction.reply({
                content: `⏭️ Skipped **${music.escapeMd(was?.title || 'the track').slice(0, 120)}**.`,
                ephemeral: true,
            });
        }
        case 'music_stop': {
            const count = queue.tracks.length + (queue.current ? 1 : 0);
            music.destroyQueue(queue, null);
            return interaction.reply({ content: `⏹️ Stopped (${count} track(s) discarded) and left the channel.`, ephemeral: true });
        }
        default:
            return interaction.reply({ content: '❌ Unknown music control.', ephemeral: true });
    }
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */
module.exports = {
    name: Events.InteractionCreate,

    async execute(interaction, client) {
        try {
            /* Buttons */
            if (interaction.isButton()) {
                if (interaction.customId.startsWith('role_')) return await handleReactionRole(interaction);
                if (interaction.customId.startsWith('verify_')) return await handleVerifyButton(interaction);
                if (interaction.customId === 'gta_sos_start') return await handleSosStart(interaction);
                if (interaction.customId.startsWith('music_')) return await handleMusicButton(interaction);
                // claim_coin_auto is handled by its own collector in events/ready.js.
                return;
            }

            /* Select menus */
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'report_category_select') return await handleReportSelect(interaction);
                if (interaction.customId === 'gta_category_select') return await handleCategorySelect(interaction);
                if (interaction.customId === 'gta_platform_select') return await handlePlatformSelect(interaction);
                return;
            }

            /* Modals */
            if (interaction.isModalSubmit()) {
                if (interaction.customId.startsWith('modal_')) return await handleVerifyModal(interaction);
                if (interaction.customId.startsWith('report_modal_')) return await handleReportModal(interaction, client);
                if (interaction.customId === 'secure_giveaway_modal') return await handleGiveawayModal(interaction);
                if (interaction.customId === 'gta_note_modal') return await handleNoteModal(interaction);
                return;
            }

            /* Slash commands */
            if (!interaction.isChatInputCommand()) return;

            // ⭐ Central runtime permission gate — see the header note.
            if (!(await perms.gateCommand(interaction))) return;

            const command = client.commands.get(interaction.commandName);
            if (!command) {
                return interaction.reply({
                    content: '❌ That command is not loaded. Try `/refresh` (admin) or restart the bot.',
                    ephemeral: true,
                });
            }
            if (typeof command.execute !== 'function') {
                return interaction.reply({ content: '❌ That command is misconfigured.', ephemeral: true });
            }

            await command.execute(interaction, client);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '⚠️ The command finished without responding.',
                    ephemeral: true,
                }).catch(() => {});
            }
        } catch (error) {
            // Log the real detail server-side; never echo internals back to the user.
            console.error(`[interaction:${interaction.commandName || interaction.customId}]`, formatError(error));

            const reply = {
                content: '❌ Something went wrong while handling that. The error has been logged.',
                ephemeral: true,
            };
            try {
                if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
                else await interaction.reply(reply);
            } catch { /* interaction expired */ }
        }
    },
};
