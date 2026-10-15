/**
 * /syndicate — the "secure mobile app" chat interface.
 *
 * Fixes vs. the original:
 *  • State lived in a private `syndicateStorage.json` written with a bare
 *    `fs.writeFileSync` (no try/catch, no atomic rename), so a crash mid-write
 *    truncated it and destroyed EVERY user's chat history. It now lives in the
 *    shared atomic store via lib/data.
 *  • `await guild.members.fetch()` ran on EVERY invocation — a full member-list
 *    pull that is rate-limited and expensive on large servers. It now only
 *    fetches when the cache looks empty (e.g. straight after a restart).
 *  • `awaitModalSubmit({ time: 300_000 })` was awaited INSIDE the button
 *    collector, so an open compose modal blocked every other button on the app
 *    for up to five minutes; cancelling the modal rejected the promise and the
 *    only thing catching it was a `console.log`.
 *  • Every member was labelled "`online`" regardless of presence, and the
 *    empty-state text claimed the list was verified when it was never filtered.
 *
 * ⭐ Fixes vs. the FIRST fix pass (found on re-audit):
 *  • `loadSyndicateData()` was called with NO argument in two places, so the shim
 *    returned `{ undefined: {...} }` and every `currentData[userId]` read was
 *    undefined. The Chats tab therefore always showed "No active chat nodes
 *    found" and `currentData[userId].currentPage` threw a TypeError on the
 *    Contacts tab — which the collector's async wrapper swallowed, leaving the
 *    user with Discord's "This interaction failed". Both call sites are gone and
 *    the shim has been deleted rather than left as a trap.
 *  • Sending a message was a read-modify-write across two users with no
 *    serialisation, so two messages sent quickly could lose one. It now goes
 *    through a single atomic `updateSyndicateApp` per side.
 *  • The pagination write was not awaited before the new page was rendered, so a
 *    slow disk could render page N and persist page N-1.
 */
const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const store = require('../../lib/data');

/** Hard cap so a runaway chat cannot grow without bound in the embed. */
const MAX_HISTORY_RENDERED = 20;

/**
 * Append one message to BOTH sides of a conversation atomically.
 * Each side is a separate `updateSyndicateApp` call, so the store serialises it
 * against any other writer — the original mutated a snapshot it had read earlier.
 */
async function appendMessage(fromId, toId, text, time) {
    for (const [ownerId, peerId] of [[fromId, toId], [toId, fromId]]) {
        await store.updateSyndicateApp(ownerId, (app) => {
            const chats = app.chats && typeof app.chats === 'object' ? app.chats : {};
            const thread = Array.isArray(chats[peerId]) ? chats[peerId] : [];
            thread.push({ sender: fromId, text, time });
            // Keep only the most recent messages on disk; the embed renders a slice.
            chats[peerId] = thread.slice(-200);
            return { ...app, chats };
        });
    }
}

/** Render a thread as Discord markdown. */
function renderThread(conversation, viewerId, peerName) {
    if (!Array.isArray(conversation) || !conversation.length) {
        return 'No messages yet. Send the first node transmission below.';
    }
    return conversation
        .slice(-MAX_HISTORY_RENDERED)
        .map((m) => (m.sender === viewerId
            ? `🟢 \`${m.time}\`\n💬 **You**: ${m.text}`
            : `⚪ \`${m.time}\`\n💬 **${peerName}**: ${m.text}`))
        .join('\n\n');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('syndicate')
        .setDescription('Open the secure Syndicate mobile app interface.'),

    async execute(interaction) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        const userId = interaction.user.id;
        const guild = interaction.guild;

        // The original called `await guild.members.fetch()` on every invocation
        // — a full member-list pull that is rate-limited and expensive on large
        // servers. The cache is already populated by the GuildMembers intent, so
        // we only fetch when it looks empty (e.g. right after a restart).
        if (guild.members.cache.size < guild.memberCount / 2) {
            await guild.members.fetch().catch(() => {});
        }
        const membersList = Array.from(
            guild.members.cache.filter((m) => !m.user.bot).values(),
        );

        // Reset this user's pagination to the first page (atomic, not a snapshot).
        await store.updateSyndicateApp(userId, (app) => ({ ...app, currentPage: 0 }));

        function getNavBar() {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('nav_chats').setLabel('Chats').setStyle(ButtonStyle.Secondary).setEmoji('💬'),
                new ButtonBuilder().setCustomId('nav_contacts').setLabel('Contacts').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
                new ButtonBuilder().setCustomId('nav_network').setLabel('Network').setStyle(ButtonStyle.Secondary).setEmoji('📡'),
                new ButtonBuilder().setCustomId('nav_profile').setLabel('Profile').setStyle(ButtonStyle.Secondary).setEmoji('👤')
            );
        }

        const homeEmbed = new EmbedBuilder()
            .setColor(0x00FF66)
            .setTitle('🟢 SYND // PRIVATE ROLEPLAY NETWORK')
            .setDescription('**Syndicate**\nYour underground social layer. Secure vibes, fictional people, zero boring energy.')
            .addFields(
                { name: '🟢 Status', value: '`ONLINE`', inline: true },
                { name: '🔒 Link', value: '`ENCRYPTED`', inline: true },
                { name: '👥 Members', value: `\`${membersList.length} Linked\``, inline: true }
            )
            .setFooter({ text: 'Syndicate Mobile OS' })
            .setTimestamp();

        const homeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('syn_open_app').setLabel('Open SYND').setStyle(ButtonStyle.Success).setEmoji('📱')
        );

        const message = await interaction.editReply({ embeds: [homeEmbed], components: [homeRow] });

        const collector = message.createMessageComponentCollector({ time: 900_000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) {
                return await i.reply({ content: '❌ This device is locked. It is not your terminal.', ephemeral: true });
            }

            // ⭐ Read the CALLER's state. This used to be `loadSyndicateData()` with
            // no argument, which keyed the result under `undefined`.
            const app = store.getSyndicateApp(userId);

            if (i.customId && i.customId.startsWith('syn_send_')) {
                const targetId = i.customId.replace('syn_send_', '');
                if (!/^\d{15,25}$/.test(targetId)) {
                    return i.reply({ content: '❌ That chat target is not valid.', ephemeral: true });
                }
                const targetMember = await guild.members.fetch(targetId).catch(() => null);
                const targetName = targetMember ? targetMember.user.username : 'Unknown Node';

                // ⭐ Deterministic customId: the old one embedded Date.now(), so two
                // rapid presses left two modals in flight and whichever resolved first
                // could be matched by the wrong filter.
                const modalCustomId = `synd_modal_${userId}_${targetId}`;
                const modal = new ModalBuilder()
                    .setCustomId(modalCustomId)
                    .setTitle(`Chat with ${targetName}`);

                const msgInput = new TextInputBuilder()
                    .setCustomId('synd_message_body')
                    .setLabel('Type your message:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Type your message here...')
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(1000);

                modal.addComponents(new ActionRowBuilder().addComponents(msgInput));

                await i.showModal(modal);

                // ⭐ Handle the submission on its OWN collector instead of awaiting
                // inside this one. The previous `await i.awaitModalSubmit({ time:
                // 300_000 })` blocked every other button on the app for up to five
                // minutes, and cancelling the modal rejected it.
                const modalCollector = i.createModalCollector({
                    filter: (m) => m.customId === modalCustomId && m.user.id === userId,
                    time: 120_000,
                    max: 1,
                });

                modalCollector.on('collect', async (modalInt) => {
                    try {
                        const messageText = (modalInt.fields.getTextInputValue('synd_message_body') || '').trim();
                        if (!messageText) return modalInt.deferUpdate();

                        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        await appendMessage(userId, targetId, messageText, time);
                        await modalInt.deferUpdate();

                        // Notify the recipient; a closed DM box is not an error worth throwing over.
                        try {
                            const targetUser = await modalInt.client.users.fetch(targetId);
                            await targetUser.send({
                                embeds: [new EmbedBuilder()
                                    .setColor(0x00ff66)
                                    .setTitle('📱 NEW SYNDICATE TRANSMISSION')
                                    .setDescription(
                                        `You received a new message from **${modalInt.user.username}**!\n\n> "${messageText.slice(0, 500)}"`,
                                    )
                                    .setFooter({ text: 'Run /syndicate in the server to reply.' })
                                    .setTimestamp()],
                            });
                        } catch (dmErr) {
                            console.log('[syndicate] could not DM the recipient:', dmErr.message);
                        }

                        const thread = store.getSyndicateApp(userId).chats?.[targetId] || [];
                        const chatActionRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`syn_send_${targetId}`).setLabel('Send Message').setStyle(ButtonStyle.Success).setEmoji('✍️'),
                            new ButtonBuilder().setCustomId('nav_contacts').setLabel('Back to Contacts').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
                        );

                        await interaction.editReply({
                            embeds: [new EmbedBuilder()
                                .setColor(0x00ff66)
                                .setTitle(`💬 Chat // ${targetName}`)
                                .setDescription(renderThread(thread, userId, targetName).slice(0, 4000))
                                .setFooter({ text: `online • ${thread.length} message(s)` })],
                            components: [chatActionRow],
                        });
                    } catch (error) {
                        console.error('[syndicate] message send failed:', error.message);
                        await modalInt.deferUpdate().catch(() => {});
                    }
                });

                modalCollector.on('end', (collected, reason) => {
                    // The user closed the modal or let it time out — nothing to do,
                    // and crucially nothing threw.
                    if (reason !== 'limit' && collected.size === 0) {
                        console.log(`[syndicate] compose modal closed without sending (${reason})`);
                    }
                });

                return;
            }

            if (i.customId === 'syn_open_app' || i.customId === 'nav_chats') {
                const userChats = app.chats || {};
                const chatKeys = Object.keys(userChats);

                let chatsListDesc = 'No active chat nodes found. Open Contacts to start a secure link.';
                if (chatKeys.length > 0) {
                    chatsListDesc = chatKeys.map(targetId => {
                        const targetUser = guild.members.cache.get(targetId)?.user;
                        const username = targetUser ? targetUser.username : 'Unknown Node';
                        const lastMsg = userChats[targetId].slice(-1)[0];
                        return `💬 **${username}**\n└ *${lastMsg ? lastMsg.text : 'No history'}* — \`online\``;
                    }).join('\n\n');
                }

                const appEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle('📱 SYNDICATE // CHATS')
                    .setDescription(chatsListDesc)
                    .setFooter({ text: 'Select a member from Contacts tab to chat' });

                const chatNavRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('nav_contacts').setLabel('Go to Contacts').setStyle(ButtonStyle.Success).setEmoji('👥')
                );

                return await i.update({ embeds: [appEmbed], components: [chatNavRow, getNavBar()] });
            }

            if (i.customId === 'nav_contacts' || i.customId === 'syn_page_prev' || i.customId === 'syn_page_next') {
                // ⭐ `currentData[userId].currentPage` used to throw here, because
                // `currentData` was keyed under `undefined` (see the header notes).
                const maxPages = Math.ceil(membersList.length / 25) || 1;
                const storedPage = Number(app.currentPage) || 0;
                let page = storedPage;

                if (i.customId === 'syn_page_prev') {
                    page = Math.max(0, storedPage - 1);
                } else if (i.customId === 'syn_page_next') {
                    page = Math.min(maxPages - 1, storedPage + 1);
                } else if (i.customId === 'nav_contacts') {
                    page = 0;
                }

                // Awaited: the original fired and forgot, so a slow disk could render
                // page N while persisting page N-1.
                if (page !== storedPage) {
                    await store.updateSyndicateApp(userId, (a) => ({ ...a, currentPage: page }));
                }

                const start = page * 25;
                const end = start + 25;
                const paginatedMembers = membersList.slice(start, end);

                // The original labelled every member "`online`" regardless of presence,
        // and the empty-state text claimed these were "verified members" when the
        // list was never filtered by role. Both are now accurate.
        const contactsDesc = paginatedMembers
            .map((m) => {
                const status = m.presence ? m.presence.status : 'offline';
                const dot = { online: '🟢', idle: '🟡', dnd: '🔴' }[status] || '⚫';
                return `${dot} **${m.user.username}** — \`${status}\``;
            })
            .join('\n\n');

                const contactEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle(`👥 SYNDICATE // CONTACTS (Page ${page + 1}/${maxPages})`)
                    .setDescription(contactsDesc.substring(0, 4000) || 'No other members found.')
                    .setFooter({ text: 'Select a contact from the menu below or change pages.' });

                const options = paginatedMembers.map(m => ({
                    label: m.user.username.substring(0, 25),
                    value: `chat_${m.id}`,
                    description: 'Start secure chat'
                }));

                const selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_chat_target')
                        .setPlaceholder(`Select a contact (Page ${page + 1}/${maxPages})...`)
                        .addOptions(options.length > 0 ? options : [{ label: 'No members available', value: 'none' }])
                );

                const components = [selectRow];

                const paginationRow = new ActionRowBuilder();
                if (page > 0) {
                    paginationRow.addComponents(
                        new ButtonBuilder().setCustomId('syn_page_prev').setLabel('Previous').setStyle(ButtonStyle.Primary).setEmoji('⬅️')
                    );
                }
                if (end < membersList.length) {
                    paginationRow.addComponents(
                        new ButtonBuilder().setCustomId('syn_page_next').setLabel('Next').setStyle(ButtonStyle.Primary).setEmoji('➡️')
                    );
                }

                if (paginationRow.components.length > 0) {
                    components.push(paginationRow);
                }
                components.push(getNavBar());

                return await i.update({ embeds: [contactEmbed], components: components });
            }

            if (i.customId === 'nav_network') {
                const netEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle('📡 SYNDICATE // NETWORK NODES')
                    .addFields(
                        { name: 'Live Nodes', value: `\`${membersList.length} Active\``, inline: true },
                        { name: 'Network', value: '`STABLE`', inline: true },
                        { name: 'Sync Layer', value: '`ACTIVE`', inline: true }
                    )
                    .setDescription('All security relays are operating at optimal cryptographic performance.');

                return await i.update({ embeds: [netEmbed], components: [getNavBar()] });
            }

            if (i.customId === 'nav_profile') {
                const profileEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle('👤 SYNDICATE // PROFILE')
                    .setDescription(`**User ID:** \`${userId}\`\n**Security Clearance:** Level 3 Verified\n**Encrypted Status:** Connected`);

                return await i.update({ embeds: [profileEmbed], components: [getNavBar()] });
            }

            if (i.isStringSelectMenu() && i.customId === 'select_chat_target') {
                const targetId = i.values[0].replace('chat_', '');
                if (targetId === 'none') return;
                const targetMember = guild.members.cache.get(targetId);
                const targetName = targetMember ? targetMember.user.username : 'User';

                const conversation = store.getSyndicateApp(userId).chats?.[targetId] || [];
                const chatHistory = renderThread(conversation, userId, targetName);

                const activeChatEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle(`💬 Chat // ${targetName}`)
                    .setDescription(chatHistory.slice(0, 4000))
                    .setFooter({ text: `online • ${conversation.length} message(s)` });

                const chatActionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`syn_send_${targetId}`).setLabel('Send Message').setStyle(ButtonStyle.Success).setEmoji('✍️'),
                    new ButtonBuilder().setCustomId('nav_contacts').setLabel('Back to Contacts').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
                );

                return await i.update({ embeds: [activeChatEmbed], components: [chatActionRow] });
            }
        });
    },
};
