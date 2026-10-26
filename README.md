# The Syndicate — Discord Bot

A community / GTA-RP Discord bot with moderation, a persistent economy, verification
flows, self-assign roles, giveaways, native polls, Twitch live alerts, auto-translation,
scheduled greetings — and **YouTube music** in voice channels.

It also announces itself: bump the version in `package.json`, restart, and the bot posts
**"🟢 The Syndicate is LIVE"** with `@everyone` and the changelog for that release.
Ordinary restarts stay silent.

Built on [discord.js](https://discord.js.org) v14 and Node 18+. **46 commands**, atomic
JSON persistence, and permission gates enforced both at registration and at dispatch.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#    edit .env — DISCORD_TOKEN is required, GUILD_ID is strongly recommended

# 3. Validate the setup (no token needed)
npm run check      # static checks: permissions, atomic writes, dead patterns
npm test           # 176 runtime assertions against the real data layer

# 4. Run
npm start
```

`npm run gate` runs lint + `check` + `audit` + `test` in one go.

> ⚠️ **`npm test` writes to `data/store.json` on purpose** — several assertions
> overwrite it with corrupt and malformed shapes to prove the bot recovers. It
> therefore **refuses to start** if that file already contains user data. On a
> live deployment, move it aside first:
> `mv data/store.json /tmp/store.backup.json && npm test`.

> **Never commit `.env`.** It is gitignored. If a token ever leaks, reset it
> immediately in the [Discord Developer Portal](https://discord.com/developers/applications).

### Bot application settings

| Setting | Value |
|---|---|
| Privileged Gateway Intents | **Server Members Intent** ✅, **Message Content Intent** ✅, **Message Reaction Intent** ✅ |
| OAuth2 scopes | `bot`, `applications.commands` |
| Bot permissions | Manage Roles, Manage Channels, Kick Members, Ban Members, Moderate Members, Manage Messages, Send Messages, Embed Links, Read Message History, Manage Webhooks (optional) |

Set `GUILD_ID` in `.env` while developing — guild commands register instantly,
whereas global commands can take up to an hour to appear.

> ⚠️ **All three intents must be enabled in the portal, or the bot will not
> connect at all** — Discord rejects the session with `UsedDisallowedIntents`.
> The **Message Reaction Intent** is newly required: `index.js` now actually
> requests `GuildMessageReactions` so the poll reaction guard can run. Upstream
> only mentioned that intent in a code comment and never passed it to the client,
> which is why every `messageReactionAdd` handler in the original repo was dead
> code. If you would rather not enable it, delete `events/pollReactions.js` and
> remove the `GuildMessageReactions` line from `index.js` — nothing else depends
> on it.

---

## Commands

### Moderation *(gated — registration **and** runtime checks)*

| Command | Permission | Description |
|---|---|---|
| `/ban` | Ban Members | Ban a member (role hierarchy enforced) |
| `/unban` | Ban Members | Unban by user ID (validated as a snowflake) |
| `/kick` | Kick Members | Kick a member with an optional reason |
| `/mute` | Moderate Members | Timeout a member for N minutes |
| `/unmute` | Moderate Members | Remove a timeout |
| `/warn` | Moderate Members | Persistent warning, auto-escalates at 3 / 5 / 8 |
| `/clearwarn` | Moderate Members | Remove one or all warnings |
| `/clear` | Manage Messages | Bulk delete 1–100 messages, optional user filter |
| `/say` | Manage Messages | Make the bot speak (mentions escaped by default) |
| `/suggestion` | Utility | Submit a suggestion with upvote/downvote buttons |
| `/uptime` | Info | Show bot uptime, memory usage, and guild stats |
| `/id` | Manage Messages | Look up a channel or role ID |

### Protection

| Command | Permission | Description |
|---|---|---|
| `/antilink` | Manage Server | `toggle` / `add` / `remove` / `list` — per-guild link filter |
| `/antibadwords` | Manage Server | `toggle` / `add` / `remove` / `list` — per-guild word filter |
| `/antispam` | Manage Server | `toggle` / `config` / `status` — flood, duplicate & mention spam |

### Admin

| Command | Permission | Description |
|---|---|---|
| `/announcement` | Administrator | Announcement embed; ping choice is respected exactly |
| `/dm` | Administrator | DM a member via the bot (rate limited + audited) |
| `/setup` | Administrator | Lock channels behind Verified — **preview first**, merges overwrites |
| `/setupverify` | Manage Server | Post the verification panel |
| `/verify-members` | Administrator | Post a permanent verification panel |
| `/reactionroles` | Administrator | Platform self-assign panel (role creation is opt-in) |
| `/promote` | Administrator | Grant a staff role explicitly (replaces silent auto-promotion) |
| `/giveaway` | Administrator | Giveaway setup form → verified, invite-checked entries |
| `/gta-slideshow` | Administrator | Rotating vehicle showcase (self-terminating) |
| `/refresh` | Administrator | Re-register guild commands (preserves permission gates) |
| `/twitch` | Manage Channels | `set` / `add` / `remove` / `list` / `test` live alerts |

### Economy & general *(public)*

| Command | Description |
|---|---|
| `/balance` | Coins, level and XP |
| `/leaderboard` | Top 10 richest members still in the server |
| `/level` | Real level, XP progress bar and rank |
| `/inventory` | Owned items and minerals |
| `/mine` | Earn cash and minerals (best owned pickaxe) |
| `/shop` | Browse and buy items |
| `/slots` | Three-reel slot machine |
| `/coinflip` | Double or nothing |
| `/minimarket`, `/mobileshop`, `/simshop` | Themed shops |
| `/jackpot`, `/coinparty` | Admin-run prize events |
| `/syndicate` | In-server roleplay "phone" app |
| `/report` | Report a scammer, rule break or DM ad (60s cooldown) |
| `/gtsos` | Post the GTA SOS / LFG menu |
| `/help` | Full command list by category |

### Music *(public — gated by being in the player's voice channel)*

One `/music` command with 13 subcommands. The bot only ever joins **your** voice
channel, and transport controls only work from inside the channel the player is in,
so nobody can hijack another room's session.

| Subcommand | What it does |
|---|---|
| `/music play <query>` | YouTube search, a video link, or a playlist link (first 50 entries) |
| `/music queue` | Now playing with a progress bar, plus the next 10 tracks |
| `/music nowplaying` | The current track on its own |
| `/music pause` · `resume` | Pause / resume |
| `/music skip` | Skip the current track |
| `/music stop` · `disconnect` | Clear the queue, stop, and leave the channel |
| `/music volume [0–200]` | Show or set the volume |
| `/music loop <off\|track\|queue>` | Loop one track or the whole queue |
| `/music shuffle` | Shuffle the queued tracks |
| `/music remove <position>` | Remove one queued track by its number |
| `/music clear` | Empty the queue but keep the current track playing |

Guards: per-track length cap (90 min), queue cap (200), playlist expansion cap (50),
a per-member 3 s throttle on queueing, live streams and premieres refused, auto-leave
after 5 min with no listeners and 2 min after the queue drains, and only YouTube is
accepted as a source.

### Info *(public)*

| Command | Description |
|---|---|
| `/version` | Running version, build commit, uptime, feature toggles and voice-stack health |
| `/changelog` | Recent releases from `CHANGELOG.md`, or one specific version |
| `/ping` | Round-trip and gateway latency |

---

## Architecture

```
index.js            boot: validation, command/event loaders, registration, presence
lib/
  config.js         every ID, toggle and threshold — read from .env
  store.js          atomic JSON persistence (tmp + rename), per-file mutex
  data.js           unified user/guild/twitch store + legacy migration
  perms.js          central permission map + runtime gates
  roles.js          role resolution by ID, falling back to name
  invites.js        single shared invite cache (invite attribution)
  guildStats.js     member-counter voice channel
  cooldowns.js      bounded, timer-free cooldowns & sliding windows
  logger.js         secret redaction for anything posted to Discord
  twitchConfig.js   per-guild Twitch settings
  economy.js        single item/pickaxe catalog
  purchase.js       atomic buy: deduct -> deliver -> refund; safe role resolution
  shopkit.js        shared storefront for the three themed shops
  prizeEvent.js     shared engine for /jackpot and /coinparty
  duration.js       one int32-safe duration parser
  music.js          YouTube playback: queue, player, voice lifecycle, limits
  version.js        the version-change announcement engine
commands/           46 slash commands (moderation, economy, music, utility, admin)
events/             17 gateway listeners (one file per concern)
scripts/validate.js static regression checks  (npm run check)
scripts/test.js     243 runtime assertions     (npm test)
data/store.json     runtime data — created on first boot, gitignored
CHANGELOG.md        machine-read by lib/version.js and by /changelog
```

### Persistence

All state lives in **`data/store.json`**, written atomically
(`file.tmp` → `rename`) behind a per-file mutex, so a crash mid-write cannot
corrupt it and two concurrent commands cannot clobber each other.

On first boot the legacy files are migrated automatically:

| Legacy file | Mapped to |
|---|---|
| `coins.json` | `users[id].wallet` |
| `commands/economy/economyStorage.json` | `users[id].wallet` / `.bank` / `.inventory` |
| `commands/economy/syndicateStorage.json` | `users[id].app` |
| `commands/moderation/securityStorage.json` | `guilds[id]` settings |

Corrupt JSON is never fatal — it is quarantined as `*.corrupt-<timestamp>.json`
and the defaults are used instead.

---

## Configuration

Everything is in `.env`. See `.env.example` for the full annotated list.

The defaults preserve the channel/role IDs that were previously hardcoded in
source, so an existing deployment keeps working unchanged — but you can now
override any of them without editing code.

**Strongly recommended:** set `VERIFIED_ROLE_ID` and `HELPER_ROLE_ID`. Without
them the bot falls back to matching roles by *name*, which lets anyone with
Manage Roles create a decoy role called `Verified` and be treated as verified.

### Deliberately disabled defaults

These behaviours existed in the original and are now off, because they are
destructive or surprising:

| Setting | Was | Now |
|---|---|---|
| `AUTO_HELPER_ENABLED` | Role granted to a hardcoded user on every boot | `false` — use `/promote` |
| `MEDIA_EMBED_ENABLED` | Deleted members' messages containing media links | `false` |
| `TRANSLATION_DELETE_ORIGINAL` | Deleted the author's message after translating | `false` |
| `VERIFIED_PING_ENABLED` | Randomly pinged members every 3 hours | `true`, but capped and presence-aware |

---

## Music on your host

Music needs three things at runtime. All three are declared in `package.json`, and
`/version` reports which ones are actually present:

| Requirement | How it is provided |
|---|---|
| **FFmpeg** | `ffmpeg-static` ships a prebuilt binary — no system install needed |
| **Opus encoder** | `@discordjs/opus` (native, in `optionalDependencies`) with `opusscript` (pure JS) as a guaranteed fallback |
| **Encryption** | `@noble/ciphers` — pure JS, no native build |

`@discordjs/opus` is *optional on purpose*: on hosts that block native builds
(`npm install` without a compiler, some PaaS images) the install would otherwise
fail outright. When it cannot be built, `opusscript` takes over — slightly more CPU,
identical behaviour.

If your host is locked down and you do not want music at all, set `MUSIC_ENABLED=false`.
Every `/music` subcommand then replies that music is disabled, the player is never
loaded, and nothing else in the bot changes.

To check the stack without joining a channel, run `/version` — it lists the voice
dependencies as `✅ opus + encryption + ffmpeg all present` or names exactly what is
missing.

> Some hosts block outbound connections to `googlevideo.com` (where YouTube audio is
> streamed from). Music will resolve the track and then fail to play; the engine skips
> the track and says so in the channel instead of hanging.

---

## Update announcements

The token already lives on your host, so shipping an update is: **push, restart, done.**
The bot tells the server itself.

**How the trigger works**

1. Add a `## [x.y.z]` section at the top of `CHANGELOG.md` with bullet points.
2. Set `"version"` in `package.json` to the same `x.y.z`.
3. Deploy and restart.

On boot, `events/ready.js` calls `lib/version.js`, which compares `package.json`'s
version against the last announced one — persisted in `data/store.json`, so it survives
restarts. If they differ it posts:

> **🟢 The Syndicate is LIVE**
> @everyone
> **The Syndicate** is now online running **v2.1.0** (was v2.0.0). Build `a1b2c3d`.
> **What is new:** • Music — `/music` with 13 subcommands… *(up to 8 bullets)*

If the versions match, **nothing is posted** — an ordinary restart is silent. That is
deliberate: announcing on every boot means a crash-loop pings `@everyone` over and over,
which is the fastest way to get a bot kicked from a server.

**Guards**

| Guard | Default | Env var |
|---|---|---|
| Announce only on a version change | on | `ANNOUNCE_ENABLED` |
| `@everyone` ping | on | `ANNOUNCE_PING_EVERYONE` |
| Max announcements per rolling hour | 3 | `ANNOUNCE_MAX_PER_HOUR` |
| Never re-announce a past version (rollback-safe) | on | `ANNOUNCE_ONCE_PER_VERSION` |
| Announce on the very first boot | on | `ANNOUNCE_ON_FIRST_BOOT` |

* When the hourly cap is hit the version is **not** recorded, so the announcement still
  goes out on a later boot — it is delayed, never lost.
* A downgrade is recorded silently rather than announced as an "update".
* If the bot lacks **Mention Everyone** in the target channel it drops the ping and
  still posts the message, instead of sending a mention that silently does nothing.
* If `ANNOUNCE_CHANNEL_ID` is unusable it falls back to the server's system channel,
  then the first text channel — and logs that it fell back.
* A failed send is **not** recorded, so the next boot retries.

---

## Operations

```bash
npm start        # run
npm run dev      # run with --watch (Node 18.11+)
npm run check    # static validation: deps, env, command integrity
npm run lint     # eslint
```

Run it under a supervisor (`pm2`, `systemd`, Docker) with auto-restart. The bot
**exits with code 1** on an uncaught exception rather than continuing in an
undefined state — the supervisor is expected to bring it back.

### Error reporting

Unhandled rejections are logged. Uncaught exceptions are redacted, posted to
`LOG_CHANNEL_ID`, and the process exits. Stack traces are scrubbed of tokens,
webhooks, connection strings and absolute paths before they leave the process —
treat `LOG_CHANNEL_ID` as a **private staff channel** regardless.

---

## Security notes

- The bot token is read only from `DISCORD_TOKEN`. Nothing is hardcoded.
- Sensitive commands are gated twice: `setDefaultMemberPermissions` at
  registration **and** `perms.requirePermission()` at runtime. Registration alone
  is not a boundary — anyone with Manage Server can override it in Server
  Settings, and DM invocations bypass it.
- Role hierarchy is enforced for `/ban`, `/kick`, `/mute` and `/warn`, and the bot
  refuses to grant or self-assign any role at or above its own highest role, or
  any role holding Administrator.
- Mass-mention capabilities (`/announcement`, `/say`, `/twitch test`) are
  explicitly gated and default to suppressing all mentions.
- Rate limits are applied to coin earning, XP, betting, mining, reports, bot DMs
  and the verified-ping task.

---

## License

MIT — see [LICENSE](LICENSE).
