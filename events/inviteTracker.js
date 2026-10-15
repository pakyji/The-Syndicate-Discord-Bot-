/**
 * Invite tracker bootstrap.
 *
 * Now delegates to lib/invites.js, the single shared cache. The original kept
 * its own module-level Collection that no other file could see.
 */
const { Events } = require('discord.js');
const invites = require('../lib/invites');

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        await invites.warmAll(client);
        console.log('✅ Invite Tracker is active!');
    },
};
