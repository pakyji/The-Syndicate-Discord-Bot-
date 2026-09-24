const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// Aapke diye gaye channels
const MAIN_LFG_CHANNEL_ID = '1535656533919014932';
const ITALIAN_LFG_CHANNEL_ID = '1537221793922940928';

// Temporary memory store user selections ke liye
const userSelections = new Map();

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

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
                            { label: 'General Businesses / Sell', value: 'businesses', description: 'Bunker, MC, Nightclub sales or supplies' }
                        ])
                );

            return interaction.reply({
                content: '🎯 **Select the GTA activity you need help with:**',
                components: [row],
                ephemeral: true
            });
        }

        // 2. Jab user Heist/Category select kare
        if (customId === 'gta_category_select') {
            const selectedCategory = interaction.values[0];
            userSelections.set(interaction.user.id, { category: selectedCategory });

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('gta_platform_select')
                        .setPlaceholder('🎮 Select your gaming platform')
                        .addOptions([
                            { label: 'PlayStation (PS4 / PS5)', value: 'PlayStation', emoji: '🎮' },
                            { label: 'PC', value: 'PC', emoji: '🖥️' },
                            { label: 'Xbox (One / Series X|S)', value: 'Xbox', emoji: '🕹️' }
                        ])
                );

            return interaction.update({
                content: `✅ Category selected: **${selectedCategory.replace('_', ' ').toUpperCase()}**\n\nNow, select your **Platform**:`,
                components: [row]
            });
        }

        // 3. Jab user Platform select kare (Final Step)
        if (customId === 'gta_platform_select') {
            const platform = interaction.values[0];
            const data = userSelections.get(interaction.user.id) || { category: 'General' };
            const category = data.category.replace('_', ' ').toUpperCase();

            await interaction.update({
                content: '🎉 **SOS Request successfully submitted to LFG channels!**',
                components: []
            });

            // LFG Message Content
            const lfgDescription = `🚨 **New GTA LFG SOS Request!**\n\n` +
                `👤 **User:** <@${interaction.user.id}>\n` +
                `🎯 **Activity:** ${category}\n` +
                `🎮 **Platform:** ${platform}\n` +
                `💬 *React or message the user to join the crew!*`;

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

            // B. Italian Target Channel mein Translate kar ke bhejein
            const italianChannel = interaction.guild.channels.cache.get(ITALIAN_LFG_CHANNEL_ID) || await interaction.guild.channels.fetch(ITALIAN_LFG_CHANNEL_ID).catch(() => null);
            if (italianChannel) {
                try {
                    // Italian mein translate karne ke liye free MyMemory API
                    const textToTranslate = `New GTA LFG SOS Request! Activity: ${category}, Platform: ${platform}, User: ${interaction.user.username}`;
                    const encoded = encodeURIComponent(textToTranslate);
                    const transRes = await axios.get(`https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|it`);
                    const translatedText = transRes.data.responseData.translatedText || textToTranslate;

                    const italianDescription = `🚨 **Nuova Richiesta SOS GTA LFG!**\n\n` +
                        `👤 **Utente:** <@${interaction.user.id}>\n` +
                        `🎯 **Attività:** ${category}\n` +
                        `🎮 **Piattaforma:** ${platform}\n` +
                        `💬 *Reagisci o scrivi all'utente per unirti alla crew!*\n\n` +
                        `*(Traduzione: ${translatedText})*`;

                    const italianEmbed = new EmbedBuilder()
                        .setColor('#00AAFF')
                        .setTitle('🚨 Avviso SOS GTA V')
                        .setDescription(italianDescription)
                        .setTimestamp();

                    await italianChannel.send({ embeds: [italianEmbed] });
                } catch (err) {
                    console.error('Italian translation error in SOS:', err);
                    // Agar translation fail ho jaye toh normal english embed bhej do
                    await italianChannel.send({ embeds: [lfgEmbed] });
                }
            }

            // Memory clear kar dein
            userSelections.delete(interaction.user.id);
        }
    },
};
