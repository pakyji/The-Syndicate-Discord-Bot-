# Changelog

All notable changes to **The Syndicate** are documented here.

This file is machine-read: `lib/version.js` parses the `## [x.y.z]` headings and the
bullet points under them, then quotes the newest entry in the automatic
*"🟢 The Syndicate is LIVE"* announcement, and `/changelog` renders it inside Discord.

**To ship an update:** add a new `## [x.y.z]` section at the top, bump `"version"` in
`package.json` to the same number, then deploy and restart. The bot compares the two on
boot and announces only when they differ — an ordinary restart stays silent.

---

## [2.2.0] - 2026-10-15

### Removed
- **Automatic coin drops.** The ready handler no longer launches a claim-embed
  ("🪙 Coin Drop") in the drop channel every 30 minutes, and `AUTO_DROP_CHANNEL_ID`
  is gone from the config and `.env.example`. The economy itself is untouched —
  balances, shops, giveaways and `/coinflip` all work exactly as before; only the
  scheduled free-coin drops are gone.

## [2.1.1] - 2026-10-15

### Fixed
- **Crash loop: `client.user.setPresence(...).catch is not a function`.** In discord.js v14
  the presence setters are synchronous — they return a `Presence`, not a Promise — so the
  `.catch()` on the status-rotation timer threw a `TypeError` on every tick. An uncaught
  exception inside a timer callback kills the process, so hosts restart-looped the bot and
  every restart dropped live voice connections (music "never played"). Presence is now
  applied through a guarded synchronous helper that cannot take the bot down.
- `scripts/validate.js` now rejects `.then()`/`.catch()` chained onto
  `setPresence()`/`setActivity()`/`setStatus()` anywhere in the tree, so this bug class
  cannot ship again silently.

## [2.1.0]

### Added
- **Music** — `/music` with 13 subcommands: `play`, `queue`, `nowplaying`, `pause`, `resume`, `skip`, `stop`, `disconnect`, `volume`, `loop`, `shuffle`, `remove`, `clear`. YouTube search, video links and playlists via `play-dl` + `@discordjs/voice`
- Now-playing embed with pause/skip/stop buttons, gated to the voice channel the player is in
- `/version` — running version, build commit, uptime, and voice-stack health
- `/changelog` — read this file from inside Discord, for one release or the recent ones
- Automatic **version-change announcement**: on a new version the bot posts "The Syndicate is LIVE" with `@everyone` and the changelog, then records it so a restart cannot repeat it
- Hourly cap on announcements (default 3) so a redeploy loop cannot spam the server
- `ANNOUNCE_*` and `MUSIC_*` environment variables for every limit and toggle
- Bundled `ffmpeg-static`, plus `@discordjs/opus` as an *optional* dependency with `opusscript` as a pure-JS fallback, so `npm install` still succeeds where native builds are blocked
- `npm run gate` — lint + static validator + the full runtime suite in one command
- `lib/duration.js`, `lib/prizeEvent.js`, `lib/purchase.js`, `lib/shopkit.js`, `lib/music.js`, `lib/version.js`
- `events/pollReactions.js` — the poll reaction guard, which upstream could never run

### Fixed
- **Double spend in all three themed shops** — the balance was checked once and deducted several awaits later (`/simshop` after a 60-second modal), so the same coins could be spent twice and the balance could go negative. Purchases are now deduct → deliver → refund
- **Total data loss in the store** — `updateGuild`, `updateTwitch`, `updateSyndicate` and `updateUser` treated the callback's return value as the entire document, so one guild-settings write deleted every wallet, warning and level
- **Whole-bot crash on a malformed store** — `migrateLegacy()` wrote to `data.meta` without checking it existed, so a `store.json` missing `meta` threw on *every* read
- **`/jackpot` and `/coinparty`** — unbounded inputs (negative ranges, 10^15-coin prizes, durations that overflow Node's int32 timer), an un-awaited payout that announced coins which were never written, and bots could win
- **Giveaway's "30 day maximum" never worked** — 30 days overflows Node's int32 timer and fires immediately, so the giveaway ended the instant it was created. The ceiling is now 21 days
- **`/poll` announced success before the poll existed** — no permission pre-check, no try/catch, and Discord's 300/55-character limits were never validated
- **A duplicate `/poll` command** was silently discarded by the loader while the real one stayed broken
- **`GuildMessageReactions`** was in a code comment but never passed to the client, so every reaction handler in the repo was dead code
- **`/syndicate`** read `state[undefined]` — the Chats tab was always empty and the Contacts tab threw on every click; its compose modal also blocked the whole app for up to five minutes
- Purchasable roles were matched by **name** with no hierarchy or privilege check, so a decoy "VIP" role could be sold and any role above the bot failed after payment
- Uncapped cashback could exceed the price paid, making some purchases net-positive
- `.gitignore` used `data/` with `!data/.gitkeep`, which git cannot honour — the placeholder was never committable and a fresh clone had no `data/` folder
- `npm test` did not exist, and the harness wrote to the live `data/store.json`; it now refuses to run against real user data

### Changed
- The three themed shops share one engine, so their catalogues, choices and storefront embeds can no longer drift apart
- `/jackpot` and `/coinparty` share one prize engine with the same bounds, payout and anti-bot rules
- `/poll` supports up to ten native answers, a configurable duration, a target channel and multiselect
- Duration parsing is single-sourced in `lib/duration.js` and rejects anything a Node timer cannot schedule

---

## [2.0.0]

### Added
- `lib/` infrastructure: atomic JSON store with per-file mutex and corruption quarantine, unified data layer, central config, permission gates, role resolution by ID, bounded cooldowns, invite tracking, log redaction, guild stats
- `scripts/validate.js` (`npm run check`) — eight static regression checks
- `scripts/test.js` (`npm test`) — a runtime harness covering the store, economy, moderation and permission layers
- `events/antispamListener.js` — the anti-spam enforcement that never existed upstream
- `/promote` — an explicit, audited replacement for silent auto-promotion
- `README.md`, `LICENSE` (MIT), `.env.example`, `.eslintrc.json`, `ESLINT.md`, `FIXES.md`, and a committed lockfile

### Fixed
- **All 18 stripped `default_member_permissions`** — `index.js` forwarded only `{name, description, options}` at registration, so `/ban`, `/dm`, `/announcement`, `/antispam` and 14 others were usable by every member. Permissions are now forwarded, re-checked at dispatch by `perms.gateCommand()`, and checked again inside each command
- `commands/moderation/warn.js` was a verbatim copy of the root `antispam.js` and called `client.login()` at require time, opening a second gateway session on the same token
- Undeclared dependencies (`axios`, `node-cron`) made a fresh `npm install` unbootable
- `/mine` crashed on every call after the first (temporal dead zone on `const now`)
- `/clear` had no permission gate and always deleted exactly 5 messages
- 47 non-atomic `writeFileSync` calls that could truncate a store mid-write
- Four disconnected coin databases, three of them on CWD-relative paths
- Levels and warnings were memory-only, and `/level` returned a hardcoded fake string
- Coin drops were announced but never credited — no balance write existed
- Three competing invite caches meant "Invited By" always read `Unknown / Direct Link`
- `antilinkListener.js` used a module-scoped `/g` regex, so `.test()` alternated true/false and roughly half of all links slipped through
- `/setup` used `permissionOverwrites.set([...])`, which **replaces** every overwrite and wiped moderation permissions unrecoverably
- `mediaEmbed.js` deleted members' own messages on any media link, in every channel
- `errorScanner.js` swallowed `uncaughtException` and posted raw stack traces to a public channel
- `gtsos.js` posted the LFG menu into the staff error-log channel

### Changed
- Every hardcoded snowflake moved to `.env` via `lib/config.js`, with defaults preserving the original values
- Destructive behaviours are off by default: `AUTO_HELPER_ENABLED`, `MEDIA_EMBED_ENABLED`, `TRANSLATION_DELETE_ORIGINAL`, `MEDIA_EMBED_DELETE_ORIGINAL`
- Unused dependencies removed: `translate-google-api` (`@discordjs/voice` returns in 2.1.0, now actually used)

---

## [1.0.0]

### Added
- Original upstream release: economy, moderation, verification, Twitch live notifications, giveaways, themed coin shops and the Syndicate roleplay app
- 238 commits, single contributor, no README, no lockfile and no tests
