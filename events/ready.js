/**
 * Ready: version announcement, music housekeeping, invite cache warm-up.
 *
 * History: this file also ran the automatic 30-minute coin drops. Removed on
 * request (2026-10-15, v2.2.0) — the drops "launched" a claim embed in the drop
 * channel every half hour and were not wanted. Everything else stays:
 *  • `global.invitesCache` is a property on the client — polluting `global`
 *    makes the state invisible and impossible to reason about.
 *  • Invite fetch failures no longer spam a console.error per guild when the bot
 *    simply lacks Manage Guild.
 *  • Conflicting presence: this file once set "HD music & chat" while index.js
 *    set a rotating status list. The rotating list wins; this one is removed.
 */
const { Events } = require('discord.js');
const config = require('../lib/config');
const version = require('../lib/version');
const music = require('../lib/music');
const invites = require('../lib/invites');

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        /* 0. Version announcement + music housekeeping.
         *    Neither may throw: a failed announcement or sweep must never stop
         *    the bot from coming online. */
        try {
            await version.announceIfUpdated(client);
        } catch (error) {
            // Never let a failed announcement stop the bot from coming online.
            console.error('[ready] version announcement threw:', error.message);
        }
        if (config.music.enabled) music.startSweep();

        /* 1. Warm the SHARED invite cache (lib/invites.js) used by guildMemberAdd.
         *    The original built its own `global.invitesCache` here while
         *    guildMemberAdd.js captured a separate empty Map at load time, so
         *    invite attribution never worked. */
        await invites.warmAll(client);
    },
};
