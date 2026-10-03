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

        // Fetch verified members (excluding bots)
        await guild.members.fetch();
        const membersList = guild.members.cache.filter(m => !m.user.bot);

        const data = loadSyndicateData();
        if (!data[userId]) {
            data[userId] = { chats: {} };
            saveSyndicateData(data);
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF66)
            .setTitle('📱 SYNDICATE // SECURE NETWORK')
            .setDescription('Your underground social layer. Secure vibes, verified members, zero boring energy.\n\n*Select a menu option below to navigate your chats or contacts.*')
            .addFields(
                { name: '🟢 Network Status', value: '`STABLE`', inline: true },
                { name: '🔒 Encryption', value: '`ACTIVE`', inline: true },
                { name: '👥 Verified Members', value: `\`${membersList.size} Connected\``, inline: true }
            )
            .setFooter({ text: 'Syndicate Mobile OS v2.4' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('syn_chats')
                .setLabel('Chats')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💬'),
            new ButtonBuilder()
                .setCustomId('syn_contacts')
                .setLabel('Verified Contacts')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👥'),
            new ButtonBuilder()
                .setCustomId('syn_network')
                .setLabel('Network Nodes')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📡')
        );

        const message = await interaction.editReply({ embeds: [embed], components: [row] });

        // Collector for interaction handling
        const collector = message.createMessageComponentCollector({ time: 300_000 }); // 5 minutes

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) {
                return await i.reply({ content: '❌ Yeh phone sirf aapka hai!', ephemeral: true });
            }

            const currentData = loadSyndicateData();

            if (i.customId === 'syn_chats') {
                const userChats = currentData[userId]?.chats || {};
                const chatKeys = Object.keys(userChats);

                let chatDesc = 'Aapki koi active chat nahi hai. Verified Contacts mein jaakar kisi ko message bhejein!';
                if (chatKeys.length > 0) {
                    chatDesc = chatKeys.map(targetId => {
                        const targetUser = guild.members.cache.get(targetId)?.user;
                        const username = targetUser ? targetUser.username : 'Unknown User';
                        const lastMsg = userChats[targetId].slice(-1)[0];
                        return `• **${username}**: "${lastMsg ? lastMsg.text : 'No messages'}"`;
                    }).join('\n');
                }

                const chatEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle('💬 Syndicate // Recent Chats')
                    .setDescription(chatDesc);

                // Build select menu for contacts to chat with
                const options = membersList.map(m => ({
                    label: m.user.username.substring(0, 25),
                    value: `chat_${m.id}`,
                    description: 'Open encrypted chat line'
                })).slice(0, 25); // Discord limit 25

                const selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_chat_target')
                        .setPlaceholder('Select a verified member to chat...')
                        .addOptions(options.length > 0 ? options : [{ label: 'No members found', value: 'none' }])
                );

                const backRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('syn_home').setLabel('Home').setStyle(ButtonStyle.Primary).setEmoji('🏠')
                );

                await i.update({ embeds: [chatEmbed], components: [selectRow, backRow] });
            }

            else if (i.customId === 'syn_contacts') {
                let contactsText = membersList.map(m => `🟢 **${m.user.username}** — \`linked & verified\``).join('\n');
                if (!contactsText) contactsText = 'No verified members found.';

                const contactEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle('👥 Syndicate // Verified Members')
                    .setDescription(contactsText);

                const backRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('syn_home').setLabel('Home').setStyle(ButtonStyle.Primary).setEmoji('🏠')
                );

                await i.update({ embeds: [contactEmbed], components: [backRow] });
            }

            else if (i.customId === 'syn_network') {
                const netEmbed = new EmbedBuilder()
                    .setColor(0x00FF66)
                    .setTitle('📡 Syndicate // Network Nodes')
                    .addFields(
                        { name: 'Live Nodes', value: '`3 Active Nodes`', inline: false },
                        { name: 'Network Stability', value: '`STABLE (100%)`', inline: true },
                        { name: 'Sync Layer', value: '`ACTIVE`', inline: true }
                    );

                const backRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('syn_home').setLabel('Home').setStyle(ButtonStyle.Primary).setEmoji('🏠')
                );

                await i.update({ embeds: [netEmbed], components: [backRow] });
            }

            else if (i.customId === 'syn_home') {
                await i.update({ embeds: [embed], components: [row] });
            }
        });

        // Handle Select Menu and Modals for Messaging
        client.on('interactionCreate', async (menuInteraction) => {
            if (!menuInteraction.isStringSelectMenu() || menuInteraction.customId !== 'select_chat_target') return;
            if (menuInteraction.user.id !== userId) return;

            const targetId = menuInteraction.values[0].replace('chat_', '');
            const targetMember = guild.members.cache.get(targetId);
            const targetName = targetMember ? targetMember.user.username : 'User';

            // Open Modal to type message
            const modal = new ModalBuilder()
                .setCustomId(`synd_msg_modal_${targetId}`)
                .setTitle(`Chat with ${targetName}`);

            const msgInput = new TextInputBuilder()
                .setCustomId('synd_message_body')
                .setLabel('Message likhein:')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Type your encrypted message here...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
            await menuInteraction.showModal(modal);
        });

        // Handle Modal Submit to save messages permanently
        client.on('interactionCreate', async (modalInteraction) => {
            if (!modalInteraction.isModalSubmit() || !modalInteraction.customId.startsWith('synd_msg_modal_')) return;
            if (modalInteraction.user.id !== userId) return;

            const targetId = modalInteraction.customId.replace('synd_msg_modal_', '');
            const messageText = modalInteraction.fields.getTextInputValue('synd_message_body');

            const currentData = loadSyndicateData();
            if (!currentData[userId]) currentData[userId] = { chats: {} };
            if (!currentData[userId].chats[targetId]) currentData[userId].chats[targetId] = [];

            // Save message permanently in storage
            currentData[userId].chats[targetId].push({
                sender: userId,
                text: messageText,
                time: new Date().toLocaleTimeString()
            });

            // Also mirror it for receiver so they can see it too
            if (!currentData[targetId]) currentData[targetId] = { chats: {} };
            if (!currentData[targetId].chats[userId]) currentData[targetId].chats[userId] = [];
            currentData[targetId].chats[userId].push({
                sender: userId,
                text: messageText,
                time: new Date().toLocaleTimeString()
            });

            saveSyndicateData(currentData);

            await modalInteraction.reply({ content: `✅ Message securely sent and saved to Syndicate database!`, ephemeral: true });
        });
    },
};
