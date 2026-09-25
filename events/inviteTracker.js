const { Events, EmbedBuilder, Collection } = require('discord.js');

// Server ke invite codes store karne ke liye map
const invitesCache = new Collection();

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        // Bot start hote hi saare guilds ke invites fetch karke cache mein save kar lo
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const firstInvites = await guild.invites.fetch();
                invitesCache.set(guildId, new Map(firstInvites.map((invite) => [invite.code, invite.uses])));
            } catch (err) {
                console.error(`Could not fetch invites for guild ${guildId}:`, err);
            }
        }
        console.log('✅ Invite Tracker is active!');
    },
};
