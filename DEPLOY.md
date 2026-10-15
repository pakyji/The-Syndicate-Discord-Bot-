# Deploying this update to GitHub

Everything below assumes the fixed tree lives at `/home/user/fixed` and your repository
is `pakyji/The-Syndicate-Discord-Bot-`. Copy the blocks in order; each one says what it
does and what "good" looks like.

There are two routes. **Route A** replaces the repository contents with the fixed tree in
one commit — simplest, and it is what the patches were built for. **Route B** applies the
patch to a fresh clone of your current `main`, which keeps your existing git history
untouched.

---

## Route A — push the fixed tree (recommended)

```bash
cd /home/user/fixed

# 1. Prove the tree is healthy before it goes anywhere near GitHub.
npm install
npm run gate
#    -> eslint:      0 problems
#    -> validate:    Validated 84 files, 46 commands, 6 event types
#    -> audit:       ✅ clean (46 unique command names, no dead modules)
#    -> test:        274 passed, 0 failed

# 2. Turn the fixed tree into a git repo pointed at your remote.
git init -b main
git remote add origin git@github.com:pakyji/The-Syndicate-Discord-Bot-.git

# 3. Adopt your existing history so the push is a fast-forward, not a force-push.
git fetch origin main
git reset --soft origin/main     # point HEAD at your last commit (index stays empty)
git read-tree origin/main        # fill the index from that commit, working tree untouched

# 4. Stage everything and REVIEW IT before committing.
git add -A
git status --short | head -60
#    -> MUST NOT list: .env, node_modules/, data/store.json, *.patch
#    -> MUST list:     data/.gitkeep, package-lock.json, CHANGELOG.md, DEPLOY.md
git diff --cached --stat | tail -5
#    -> expect roughly: 104 files changed, ~15939 insertions(+), ~3656 deletions(-)
#
# If the insertion count is in the tens of thousands, a *.patch artifact got staged.
# .gitignore excludes them; check with:  git ls-files '*.patch'

# The deletions are intentional: the root antispam.js and twitchChecker.js, the four
# legacy JSON stores, and commands/moderation/warn.js's duplicate body. Confirm the
# list before you commit — `git status` shows every `D` line.

# 5. Commit and push.
git commit -m "feat: music, version announcements, and the full audit fix (v2.1.0)

Adds YouTube music (/music, 13 subcommands), an automatic version-change
announcement with @everyone, /version and /changelog.

Also fixes every finding from the code and security audit: 18 stripped
permission gates, a second gateway session opened at require time, undeclared
dependencies, a double spend in all three themed shops, total data loss in the
store's update helpers, a crash on a malformed store.json, unbounded prize-event
inputs, and a giveaway duration that overflowed Node's int32 timer.

274 runtime assertions, eslint clean, static validator clean."

git push origin main
```

If step 3 reports that `origin/main` does not exist (an empty repository), skip the
`fetch`, `reset` and `read-tree` and push with `git push -u origin main`.

---

## Route B — apply the patch to your current clone

```bash
git clone git@github.com:pakyji/The-Syndicate-Discord-Bot-.git
cd The-Syndicate-Discord-Bot-

# Dry run first — this must print nothing and exit 0.
git apply --check /home/user/patches/the-syndicate-fixes-full.patch

git apply /home/user/patches/the-syndicate-fixes-full.patch
git add -A
git commit -m "feat: music, version announcements, and the full audit fix (v2.1.0)"
git push
```

Three patch files live in `/home/user/patches/` — deliberately **outside** the repository.
A 930 KB patch committed inside its own tree inflates the diff by ~70,000 lines and makes
every regenerated patch self-referential, so `.gitignore` now excludes `*.patch` and
`*.diff`.

| File | Use it when |
|---|---|
| `the-syndicate-fixes-full.patch` | You want the committed `package-lock.json` too (**recommended** — reproducible installs) |
| `the-syndicate-fixes.patch` | You would rather regenerate the lockfile yourself |
| `0001-fix-resolve-all-critical-high-and-medium-findings-fr.patch` | You want to `git am` it and keep the authored commit message |

All three apply cleanly against upstream `7f65d73` and produce a tree byte-identical to
`/home/user/fixed`.

---

## Set the repository's About

The *About* box (description, website, topics) is stored on GitHub, not in the repository,
so it is set separately. Web UI: repository → ⚙️ next to **About**, top-right.

**Description**

```
The Syndicate — a Discord community bot: moderation, verification, economy, giveaways, native polls and YouTube music. Every ID configurable via .env, atomic persistence, permission gates enforced at registration and at dispatch.
```

**Topics**

```
discord  discord-bot  discord-js  moderation  economy  music  giveaway  verification  javascript  nodejs
```

Or with the API (needs a token with `repo` scope):

```bash
export GITHUB_TOKEN=ghp_...
export REPO=pakyji/The-Syndicate-Discord-Bot-

curl -X PATCH "https://api.github.com/repos/$REPO" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "description": "The Syndicate — a Discord community bot: moderation, verification, economy, giveaways, native polls and YouTube music. Every ID configurable via .env, atomic persistence, permission gates enforced at registration and at dispatch.",
    "has_issues": true,
    "has_projects": false,
    "has_wiki": false
  }'

curl -X PUT "https://api.github.com/repos/$REPO/topics" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.mercy-preview+json" \
  -d '{"names":["discord","discord-bot","discord-js","moderation","economy","music","giveaway","verification","javascript","nodejs"]}'
```

> A token pasted into a chat or a shell history is a leaked token. Revoke it at
> <https://github.com/settings/tokens> as soon as the two calls succeed.

---

## On the host

```bash
cd /path/to/The-Syndicate-Discord-Bot-
git pull

npm install          # ⚠️ REQUIRED this time — the voice stack adds dependencies
npm run gate         # lint + validator + silent-drop audit + 274 tests
npm start            # or: pm2 restart syndicate
```

`npm install` is **not optional** for this release: `@discordjs/voice`, `play-dl`,
`ffmpeg-static`, `@noble/ciphers` and `opusscript` are new. If the host cannot build
native modules, `@discordjs/opus` is skipped automatically (it is in
`optionalDependencies`) and `opusscript` takes over — the install still succeeds.

### Environment variables to add to `.env`

```ini
# Music
MUSIC_ENABLED=true
MUSIC_DEFAULT_VOLUME=80
MUSIC_MAX_QUEUE=200
MUSIC_MAX_TRACK_MINUTES=90

# Update announcement
ANNOUNCE_ENABLED=true
ANNOUNCE_PING_EVERYONE=true
ANNOUNCE_CHANNEL_ID=<your announcements channel ID>
ANNOUNCE_MAX_PER_HOUR=3
```

`.env.example` documents every variable, its default and why the limit exists.

### Discord developer portal

| Setting | Value |
|---|---|
| Privileged Gateway Intents | **Server Members** ✅ · **Message Content** ✅ · **Message Reaction** ✅ |
| OAuth2 scopes | `bot`, `applications.commands` |
| Bot permissions | Manage Roles, Manage Channels, Kick Members, Ban Members, Moderate Members, Manage Messages, **Mention Everyone**, Send Messages, Embed Links, Read Message History, **Connect**, **Speak**, **View Channel** |

Three of these matter for the new features:

* **Message Reaction Intent** — newly *requested* by `index.js`. Upstream only mentioned
  it in a comment and never passed it to the client, which is why every reaction handler
  in the original repo was dead code. If it is not enabled in the portal, Discord rejects
  the gateway session with `UsedDisallowedIntents` and **the bot will not start**.
  If you would rather not enable it, delete `events/pollReactions.js` and remove the
  `GuildMessageReactions` line from `index.js`; nothing else depends on it.
* **Mention Everyone** — needed in `ANNOUNCE_CHANNEL_ID` for the `@everyone` ping to
  actually notify. Without it the bot drops the ping and still posts the message.
* **Connect + Speak** — needed in any voice channel `/music` should play in. The command
  refuses to join and names the missing permission rather than sitting silent.

After the bot restarts, re-invite it only if you changed the permission integer; the
`Mention Everyone`, `Connect` and `Speak` permissions can be granted to its existing role
directly in *Server Settings → Roles*.

---

## Shipping future updates

The announcement is triggered by a **version change**, not by a restart:

1. Add a `## [x.y.z]` section at the top of `CHANGELOG.md` with bullet points.
2. Set the same `"version"` in `package.json`.
3. `git commit -am "release: vX.Y.Z" && git push`, then restart on the host.

The bot compares the two on boot against the last version it announced (stored in
`data/store.json`) and posts once:

> **🟢 The Syndicate is LIVE** — @everyone
> **The Syndicate** is now online running **v2.2.0** (was v2.1.0).
> **What is new:** • … *(up to 8 bullets from CHANGELOG.md)*

An ordinary restart on the same version posts nothing, so a crash-loop cannot spam the
server. If you redeploy several times in an hour, the cap (`ANNOUNCE_MAX_PER_HOUR`,
default 3) holds the extra announcements back — and because the version is not recorded
when the cap triggers, the announcement still goes out on a later boot rather than being
lost.

To check what is running without leaving Discord: `/version` (build, uptime, feature
toggles, voice-stack health) and `/changelog` (the same file the announcement quotes).
