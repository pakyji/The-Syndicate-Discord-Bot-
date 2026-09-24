const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');

// Aapke diye gaye channels
const MAIN_LFG_CHANNEL_ID = '1535656533919014932';
const ITALIAN_LFG_CHANNEL_ID = '1537221793922940928';

// Temporary memory store user selections ke liye
const userSelections = new Map();

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

        const customId = interaction.customId;

        // 1. Jab user "Open GTA SOS Menu" button par click kare
        if (customId === 'gta_sos_start') {
            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('gta_category_select')
                        .setPlaceholder('📂 Choose a GTA Activity / Heist category')
                        .addOptions([
                            { label: 'Cayo Perico Heist', value: 'cayo_perico', description: 'Complete setups and finale help' },
                            { label: 'Diamond Casino Heist', value: 'casino_heist', description: 'Vault approach, preps & finale' },
                            { label: 'The Doomsday Heist', value: 'doomsday', description: 'Act 1, 2, 3 setups & missions' },
                            { label: 'Classic Heists', value: 'classic_heists', description: 'Fleeca, Prison Break, Pacific Standard' },
                            { label: 'General Businesses / Sell', value: 'businesses', description: 'Bunker, MC, Nightclub sales or supplies' },
                            { label: 'Free Roam / CEO Work', value: 'free_roam', description: 'VIP work, Client jobs, or CEO missions' },
                            { label: 'LS Tuners / Contracts', value: 'ls_tuners', description: 'Auto Shop contracts & street races' },
                            { label: 'Salvage Yard & Cluckin Bell', value: 'salvage_yard', description: 'Robberies and raid setups' }
                        ])
                );

            return interaction.reply({
                content: '🎯 **Select the GTA activity you need help with:**',
                components: [row],
                ephemeral: true
            });
        }

        // 2. Jab user Heist/Category select kare -> Platform menu dikhayein (Separate PS4 & PS5)
        if (customId === 'gta_category_select') {
            const selectedCategory = interaction.values[0];
            userSelections.set(interaction.user.id, { category: selectedCategory });

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('gta_platform_select')
                        .setPlaceholder('🎮 Select your gaming platform')
                        .addOptions([
                            { label: 'PlayStation 4 (PS4)', value: 'PS4', emoji: '🎮' },
                            { label: 'PlayStation 5 (PS5)', value: 'PS5', emoji: '🎮' },
                            { label: 'PC', value: 'PC', emoji: '🖥️' },
                            { label: 'Xbox (One / Series X|S)', value: 'Xbox', emoji: '🕹️' }
                        ])
                );

            return interaction.update({
                content: `✅ Category selected: **${selectedCategory.replace('_', ' ').toUpperCase()}**\n\nNow, select your **Platform**:`,
                components: [row]
            });
        }

        // 3. Jab user Platform select kare -> Modal open ho (Custom Note ke liye)
        if (customId === 'gta_platform_select') {
            const platform = interaction.values[0];
            const data = userSelections.get(interaction.user.id) || { category: 'General' };
            data.platform = platform;
            userSelections.set(interaction.user.id, data);

            // Modal create karna taaki user apna note/message likh sake
            const modal = new ModalBuilder()
                .setCustomId('gta_note_modal')
                .setTitle('📝 Add Optional Note / Details');

            const noteInput = new TextInputBuilder()
                .setCustomId('user_custom_note')
                .setLabel('Specific details (Mic, players, etc.)') // Character length fixed (< 45 chars)
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('E.g., Need 2 more players, mic required, hard mode...')
                .setRequired(false)
                .setMaxLength(250);

            const modalRow = new ActionRowBuilder().addComponents(noteInput);
            modal.addComponents(modalRow);

            return await interaction.showModal(modal);
        }

        // 4. Jab user Modal submit kare (Final Step)
        if (customId === 'gta_note_modal') {
            const customNote = interaction.fields.getTextInputValue('user_custom_note') || 'No additional notes provided.';
            const data = userSelections.get(interaction.user.id) || { category: 'General', platform: 'Unknown' };
            
            const category = data.category.replace('_', ' ').toUpperCase();
            const platform = data.platform;

            await interaction.reply({
                content: '🎉 **SOS Request successfully submitted to LFG channels!**',
                ephemeral: true
            });

            // LFG Message Content (Main Channel)
            const lfgDescription = `🚨 **New GTA LFG SOS Request!**\n\n` +
                `👤 **User:** <@${interaction.user.id}>\n` +
                `🎯 **Activity:** ${category}\n` +
                `🎮 **Platform:** ${platform}\n` +
                `💬 **Note:** ${customNote}\n\n` +
                `*React or message the user to join the crew!*`;

            const lfgEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🚨 GTA V SOS Alert')
                .setDescription(lfgDescription)
                .setTimestamp();

            // A. Main LFG Target Channel mein bhejein
            const mainChannel = interaction.guild.channels.cache.get(MAIN_LFG_CHANNEL_ID) || await interaction.guild.channels.fetch(MAIN_LFG_CHANNEL_ID).catch(() => null);
            if (mainChannel) {
                await mainChannel.send({ embeds: [lfgEmbed] });
            }

            // B. Italian Target Channel mein Translate kar ke bhejein (Without translation text line)
            const italianChannel = interaction.guild.channels.cache.get(ITALIAN_LFG_CHANNEL_ID) || await interaction.guild.channels.fetch(ITALIAN_LFG_CHANNEL_ID).catch(() => null);
            if (italianChannel) {
                try {
                    const textToTranslate = `New GTA LFG SOS Request! Activity: ${category}, Platform: ${platform}, Note: ${customNote}, User: ${interaction.user.username}`;
                    const encoded = encodeURIComponent(textToTranslate);
                    const transRes = await axios.get(`https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|it`);
                    const translatedText = transRes.data.responseData.translatedText || textToTranslate;

                    const italianEmbed = new EmbedBuilder()
                        .setColor('#00AAFF')
                        .setTitle('🚨 Avviso SOS GTA V')
                        .setDescription(`🚨 **Nuova Richiesta SOS GTA LFG!**\n\n` +
                            `👤 **Utente:** <@${interaction.user.id}>\n` +
                            `🎯 **Attività:** ${category}\n` +
                            `🎮 **Piattaforma:** ${platform}\n` +
                            `💬 **Nota:** ${customNote}\n\n` +
                            `*Reagisci o scrivi all'utente per unirti alla crew!*`)
                        .setTimestamp();

                    await italianChannel.send({ embeds: [italianEmbed] });
                } catch (err) {
                    console.error('Italian translation error in SOS:', err);
                    await italianChannel.send({ embeds: [lfgEmbed] });
                }
            }

            // Memory clear kar dein
            userSelections.delete(interaction.user.id);
        }
    },
};
