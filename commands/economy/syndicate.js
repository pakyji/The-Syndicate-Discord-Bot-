const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const storagePath = path.join(__dirname, 'syndicateStorage.json');

function loadSyndicateData() {
    if (!fs.existsSync(storagePath)) {
        fs.writeFileSync(storagePath, JSON.stringify({}, null, 4));
    }
    return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
}

function saveSyndicateData(data) {
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 4));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('syndicate')
        .setDescription('Open the secure Syndicate mobile app interface.'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const guild = interaction.guild;

        await guild.members.fetch();
        const membersList = Array.from(guild.members.cache.filter(m => !m.user.bot).values());

        const data = loadSyndicateData();
        if (!data[userId]) {
            data[userId] = { chats: {} };
            saveSyndicateData(data);
        }

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

            const currentData = loadSyndicateData();

            if (i.customId && i.customId.startsWith('syn_send_')) {
                const targetId = i.customId.replace('syn_send_', '');
                const targetMember = guild.members.cache.get(targetId);
                const targetName = targetMember ? targetMember.user.username : 'User';

                const modal = new ModalBuilder()
                    .setCustomId(`synd_msg_modal_${targetId}`)
                    .setTitle(`Chat with ${targetName}`);

                const msgInput = new TextInputBuilder()
                    .setCustomId('synd_message_body')
                    .setLabel('Type your message:')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Type your encrypted message here...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
                return await i.showModal(modal);
            }

            if (i.customId === 'syn_open_app' || i.customId === 'nav_chats') {
                const userChats = currentData[userId]?.chats || {};
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

            if (i.customId === 'nav_contacts' || (i.customId && i.customId.startsWith('contacts_page_'))) {
                let page = 0;
                if (i.customId && i.customId.startsWith('contacts_page_')) {
                    page = parseInt(i.customId.replace('contacts_page_', '')) || 0;
                }

                const start = page * 25;
                const end = start + 25;
                const paginatedMembers = membersList.slice(start, end);
                const maxPages = Math.ceil(membersList.length / 25) || 1;

                const contactsDesc = paginatedMembers.map(m => `🟢 **${m.user.username}** — \`online\``).join('\n\n');

                const contactEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle(`👥 SYNDICATE // CONTACTS (Page ${page + 1}/${maxPages})`)
                    .setDescription(contactsDesc.substring(0, 4000) || 'No verified members.')
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

                const paginationRow = new ActionRowBuilder();
                if (page > 0) {
                    paginationRow.addComponents(
                        new ButtonBuilder().setCustomId(`contacts_page_${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Primary).setEmoji('⬅️')
                    );
                }
                if (end < membersList.length) {
                    paginationRow.addComponents(
                        new ButtonBuilder().setCustomId(`contacts_page_${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Primary).setEmoji('➡️')
                    );
                }

                const components = [selectRow];
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

                const conversation = currentData[userId]?.chats?.[targetId] || [];
                let chatHistory = conversation.map(m => {
                    const isMe = m.sender === userId;
                    return isMe ? `🟢 \`${m.time}\`\n💬 **You**: ${m.text}` : `⚪ \`${m.time}\`\n💬 **${targetName}**: ${m.text}`;
                }).join('\n\n');

                if (!chatHistory) chatHistory = 'No messages yet. Send the first node transmission below.';

                const activeChatEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle(`💬 Chat // ${targetName}`)
                    .setDescription(chatHistory)
                    .setFooter({ text: 'online • encrypted link' });

                const chatActionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`syn_send_${targetId}`).setLabel('Send Message').setStyle(ButtonStyle.Success).setEmoji('✍️'),
                    new ButtonBuilder().setCustomId('nav_contacts').setLabel('Back to Contacts').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
                );

                return await i.update({ embeds: [activeChatEmbed], components: [chatActionRow] });
            }
        });

        interaction.client.on('interactionCreate', async (modalInt) => {
            if (!modalInt.isModalSubmit()) return;
            if (!modalInt.customId.startsWith('synd_msg_modal_')) return;
            if (modalInt.user.id !== userId) return;

            try {
                const targetId = modalInt.customId.replace('synd_msg_modal_', '');
                const messageText = modalInt.fields.getTextInputValue('synd_message_body');
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const currentData = loadSyndicateData();
                if (!currentData[userId]) currentData[userId] = { chats: {} };
                if (!currentData[userId].chats[targetId]) currentData[userId].chats[targetId] = [];

                currentData[userId].chats[targetId].push({ sender: userId, text: messageText, time: timestamp });

                if (!currentData[targetId]) currentData[targetId] = { chats: {} };
                if (!currentData[targetId].chats[userId]) currentData[targetId].chats[userId] = [];
                currentData[targetId].chats[userId].push({ sender: userId, text: messageText, time: timestamp });

                saveSyndicateData(currentData);

                // Modal response ko turant acknowledge karein taaki timeout na ho
                await modalInt.deferUpdate();

                try {
                    const targetUser = await interaction.client.users.fetch(targetId);
                    if (targetUser) {
                        const notifEmbed = new EmbedBuilder()
                            .setColor(0x00FF66)
                            .setTitle('📱 NEW SYNDICATE TRANSMISSION')
                            .setDescription(`You received a new message from **${interaction.user.username}**!\n\n> "${messageText}"`)
                            .setFooter({ text: 'Run /syndicate in the server to reply.' })
                            .setTimestamp();

                        await targetUser.send({ embeds: [notifEmbed] });
                    }
                } catch (dmErr) {
                    console.log('Could not send DM notification:', dmErr);
                }

                const targetMember = guild.members.cache.get(targetId);
                const targetName = targetMember ? targetMember.user.username : 'User';
                const conversation = currentData[userId].chats[targetId] || [];

                let chatHistory = conversation.map(m => {
                    const isMe = m.sender === userId;
                    return isMe ? `🟢 \`${m.time}\`\n💬 **You**: ${m.text}` : `⚪ \`${m.time}\`\n💬 **${targetName}**: ${m.text}`;
                }).join('\n\n');

                const activeChatEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle(`💬 Chat // ${targetName}`)
                    .setDescription(chatHistory)
                    .setFooter({ text: 'online • encrypted link' });

                const chatActionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`syn_send_${targetId}`).setLabel('Send Message').setStyle(ButtonStyle.Success).setEmoji('✍️'),
                    new ButtonBuilder().setCustomId('nav_contacts').setLabel('Back to Contacts').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
                );

                // Main interaction message ko edit karke updated chat screen dikhayein
                await interaction.editReply({ embeds: [activeChatEmbed], components: [chatActionRow] });
            } catch (err) {
                console.error('Modal notification error:', err);
            }
        });
    },
};
