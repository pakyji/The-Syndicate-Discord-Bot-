const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const VERIFIED_ROLE_NAME = 'Verified';

module.exports = {
    name: 'setup',
    description: 'Automatically hides all server channels from @everyone and allows Verified role.',
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({ content: '❌ Non hai i permessi di Administrator per usare questo comando!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const guild = interaction.guild;
            
            let verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
            if (!verifiedRole) {
                verifiedRole = await guild.roles.create({
                    name: VERIFIED_ROLE_NAME,
                    color: '#00FF00',
                    reason: 'Auto-created via /setup command',
                });
            }

            const channels = guild.channels.cache.values();
            let updatedCount = 0;

            for (const channel of channels) {
                try {
                    await channel.permissionOverwrites.set([
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: verifiedRole.id,
                            allow: [PermissionFlagsBits.ViewChannel],
                        }
                    ]);
                    updatedCount++;
                } catch (err) {
                    console.error(`Errore aggiornamento canale ${channel.name}:`, err);
                }
            }

            await interaction.editReply(`✅ Setup completato! Permessi aggiornati con successo per **${updatedCount}** canali.`);

        } catch (error) {
            console.error('Errore nel comando setup:', error);
            await interaction.editReply('❌ Si è verificato un errore durante l\'aggiornamento dei permessi del server.');
        }
    },
};
