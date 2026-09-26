module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`The Syndicate is online as ${client.user.tag}`);
        client.user.setActivity('HD music & chat', { type: 2 });

        // Initialize invites cache for invite tracker
        global.invitesCache = new Map();
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const invites = await guild.invites.fetch();
                global.invitesCache.set(guildId, new Map(invites.map(inv => [inv.code, inv.uses])));
            } catch (err) {
                console.error(`Could not fetch invites for guild ${guild.name}:`, err);
            }
        }
        console.log('Invite tracker cache initialized successfully!');
    },
};
