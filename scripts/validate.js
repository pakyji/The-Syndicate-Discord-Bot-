/**
 * Static validation — run with `npm run check`.
 *
 * Catches the classes of bug that broke this repo, WITHOUT needing a Discord
 * token or a live connection:
 *
 *   1. every relative require() resolves to a real file
 *   2. every dependency that is require()d is declared in package.json
 *      (axios and node-cron were used but undeclared — the bot could not boot)
 *   3. no file outside index.js calls client.login()
 *      (commands/moderation/warn.js did, opening a second gateway session on the
 *       same token and causing an endless reconnect loop)
 *   4. every command module exports a name + execute and registers its options
 *      (7 commands used a legacy shape that registered with zero options, making
 *       /clear and /kick unusable)
 *   5. every command listed in lib/perms.js actually exists, and vice versa
 *   6. every event module exports name + execute
 *   7. no bare fs.writeFileSync on a JSON data path (non-atomic, corruptible)
 *   8. no global regex .test() reuse (lastIndex alternation bug)
 *
 * Exits non-zero if anything fails, so it can gate CI.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errors = [];
const warnings = [];
let checked = 0;

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (full.includes(`${path.sep}node_modules${path.sep}`) || full.includes(`${path.sep}.git${path.sep}`)) continue;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, out);
        else if (entry.endsWith('.js')) out.push(full);
    }
    return out;
}

/**
 * Strip line and block comments so that documentation which merely MENTIONS a
 * dangerous pattern (e.g. a header comment explaining that an old file used to
 * call client.login) is not flagged as a live violation.
 */
function codeOnly(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

const files = walk(ROOT);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
]);

/* ── 1 & 2. requires ─────────────────────────────────────────── */
const usedPackages = new Set();
const REL = /require\('(\.[^']*)'\)/g;
// Matches both `discord.js` and scoped names such as `@discordjs/opus`. The old
// pattern's second character class excluded `/`, so it never matched a scoped
// package that contains one and such a dependency was always reported unused.
const PKG_RE = /require\('(@[a-z0-9-_.]+\/[a-z0-9-_.]+|[a-z0-9][a-z0-9-_.]*)'\)/g;

/**
 * Packages that are never require()d by our own source but are loaded at RUNTIME
 * by a dependency, so a plain "is it require()d" scan reports them as dead.
 * Each entry states who loads it and why it must stay installed.
 */
const RUNTIME_LOADED = {
    // @discordjs/voice probes these in order and uses the first that resolves.
    '@noble/ciphers': 'loaded by @discordjs/voice for voice encryption',
    opusscript: 'loaded by @discordjs/voice as a pure-JS opus encoder fallback',
    '@discordjs/opus': 'loaded by @discordjs/voice as the native opus encoder (optionalDependencies)',
    // Declared for `npm run lint`; obviously not require()d at runtime.
    eslint: 'dev tooling for npm run lint',
    // Read by lib/config.js through dotenv's own entry point.
    dotenv: "required in lib/config.js via require('dotenv').config()",
};

for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    checked += 1;

    let m;
    REL.lastIndex = 0;
    while ((m = REL.exec(src))) {
        const target = path.resolve(path.dirname(file), m[1]);
        if (!fs.existsSync(target) && !fs.existsSync(`${target}.js`)) {
            errors.push(`${rel}: broken require '${m[1]}'`);
        }
    }

    PKG_RE.lastIndex = 0;
    while ((m = PKG_RE.exec(src))) {
        const name = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
        if (name.startsWith('node:')) continue;
        if (require('module').builtinModules.includes(name)) continue;
        usedPackages.add(name);
        if (!declared.has(name)) {
            errors.push(`${rel}: requires '${name}' but it is not in package.json`);
        }
    }

    /* ── 3. stray client.login ──────────────────────────────── */
    if (rel !== 'index.js' && !rel.startsWith(`scripts${path.sep}`) && /client\.login\s*\(/.test(codeOnly(src))) {
        errors.push(`${rel}: calls client.login() outside index.js — this opens a second gateway session on the same token`);
    }

    /* ── 3b. stray new Client( ──────────────────────────────── */
    if (rel !== 'index.js' && !rel.startsWith(`scripts${path.sep}`) && /new\s+Client\s*\(/.test(codeOnly(src))) {
        errors.push(`${rel}: instantiates its own Discord Client — reuse the shared client passed to execute()`);
    }

    /* ── 7. non-atomic JSON writes outside lib/ ─────────────── */
    if (!rel.startsWith(`lib${path.sep}`) && !rel.startsWith(`scripts${path.sep}`) && /writeFileSync\([^)]*JSON\.stringify/.test(codeOnly(src))) {
        errors.push(`${rel}: writes JSON with bare fs.writeFileSync — use lib/store.js (atomic + serialised)`);
    }

    /* ── 8. global regex .test() on a module-scoped RegExp ──── */
    if (!rel.startsWith(`scripts${path.sep}`) && /^const\s+\w+\s*=\s*\/.*\/[a-z]*g[a-z]*;\s*$/m.test(codeOnly(src)) && /\.test\(/.test(codeOnly(src))) {
        warnings.push(`${rel}: module-scoped /g/ RegExp used with .test() — lastIndex persists between calls and alternates true/false`);
    }
}

for (const name of declared) {
    if (usedPackages.has(name)) continue;
    if (Object.prototype.hasOwnProperty.call(RUNTIME_LOADED, name)) {
        // Prove it is at least installed, which is the only thing that matters
        // for a package somebody else requires on our behalf.
        try {
            require.resolve(name, { paths: [ROOT] });
        } catch {
            warnings.push(`package.json: '${name}' (${RUNTIME_LOADED[name]}) is declared but NOT INSTALLED`);
        }
        continue;
    }
    warnings.push(`package.json: '${name}' is declared but never require()d`);
}

// The reverse check: a package required by our source but missing from
// package.json is how the original repo failed to boot on a fresh install.
for (const name of usedPackages) {
    if (!declared.has(name) && !name.startsWith('node:') && !RUNTIME_LOADED[name]) {
        const builtin = ['fs', 'path', 'os', 'crypto', 'child_process', 'url', 'util', 'events', 'stream', 'zlib', 'http', 'https', 'assert', 'buffer', 'tty', 'readline'];
        if (!builtin.includes(name)) {
            errors.push(`package.json: '${name}' is require()d but not declared as a dependency`);
        }
    }
}

/* ── 4 & 5. commands ─────────────────────────────────────────── */
const commandNames = new Set();
/** name -> the first file that registered it, so a collision can be reported. */
const commandOwners = new Map();
const commandsDir = path.join(ROOT, 'commands');

/* ------------------------------------------------------------------ *
 * Discord API limits.
 *
 * Exceeding any of these makes `PUT /applications/{id}/commands` reject the
 * WHOLE batch with a 400, so one bad command silently stops every other command
 * from registering. They are checked here rather than discovered in production.
 * ------------------------------------------------------------------ */
const DISCORD = {
    namePattern: /^[a-z0-9-_]{1,32}$/,
    maxDescription: 100,
    maxOptions: 25,
    maxChoices: 25,
};

function checkOptionTree(rel, options, depth) {
    for (const option of options || []) {
        if (!option.name || !DISCORD.namePattern.test(option.name)) {
            errors.push(`${rel}: option name "${option.name}" is not 1-32 chars of lowercase/digits/-/_`);
        }
        if (option.description && option.description.length > DISCORD.maxDescription) {
            errors.push(`${rel}: option "${option.name}" description is ${option.description.length} chars (max ${DISCORD.maxDescription})`);
        }
        if ((option.choices || []).length > DISCORD.maxChoices) {
            errors.push(`${rel}: option "${option.name}" has ${option.choices.length} choices (max ${DISCORD.maxChoices})`);
        }
        // A string option with exactly one choice cannot be re-selected — almost
        // always a catalogue that lost an entry.
        if (option.type === 3 && (option.choices || []).length === 1) {
            warnings.push(`${rel}: option "${option.name}" offers a single choice`);
        }
        // command -> subcommand GROUP -> subcommand -> options is the deepest
        // Discord allows. A group inside a group is a 400 at registration.
        if (option.type === 1 && (option.options || []).some((child) => child.type === 1)) {
            errors.push(`${rel}: "${option.name}" is a subcommand group containing another group — Discord rejects this`);
        }
        if (option.type === 1 && depth >= 1) {
            errors.push(`${rel}: "${option.name}" nests subcommands too deep (max: group -> subcommand)`);
        }
        if (option.options) checkOptionTree(rel, option.options, depth + 1);
    }
}

for (const file of walk(commandsDir)) {
    const rel = path.relative(ROOT, file);
    let mod;
    try {
        mod = require(file);
    } catch (error) {
        errors.push(`${rel}: failed to load — ${error.message}`);
        continue;
    }

    const name = mod?.data?.name ?? mod?.name;
    if (!name || name === 'undefined') {
        errors.push(`${rel}: exports no usable command name (index.js will skip it)`);
        continue;
    }
    if (typeof mod.execute !== 'function') {
        errors.push(`${rel}: exports no execute() function`);
        continue;
    }

    // ⭐ A duplicate name is SILENTLY DISCARDED by the loader in index.js, so the
    //   second file just never runs. That is how a redundant commands/utility/
    //   poll.js hid the fact that the real /poll was still broken.
    if (commandNames.has(name)) {
        errors.push(`${rel}: registers command "${name}", which ${commandOwners.get(name)} already registers — the loader silently drops this one`);
        continue;
    }
    commandNames.add(name);
    commandOwners.set(name, rel);

    // A command with no builder registers zero options — that is how /clear and
    // /kick ended up unable to accept any arguments.
    if (!mod.data) {
        const usesOptions = /options\.get(String|Integer|User|Channel|Boolean|Member|Role|Subcommand)/.test(
            fs.readFileSync(file, 'utf8'),
        );
        if (usesOptions) {
            errors.push(`${rel}: reads command options but has no SlashCommandBuilder — it will register with zero options`);
        } else {
            warnings.push(`${rel}: legacy {name, execute} shape — prefer SlashCommandBuilder for consistency`);
        }
    }

    // Every gated command must also check at runtime.
    const src = fs.readFileSync(file, 'utf8');
    if (/setDefaultMemberPermissions|default_member_permissions/.test(src) && !/requirePermission/.test(src)) {
        errors.push(`${rel}: declares a permission gate but never calls perms.requirePermission() at runtime`);
    }

    // Filename should match the command name.
    const base = path.basename(file, '.js');
    if (base !== name) {
        warnings.push(`${rel}: file is "${base}" but the command registers as "${name}"`);
    }

    // Everything index.js actually sends to Discord.
    let json = null;
    try {
        json = typeof mod.data?.toJSON === 'function' ? mod.data.toJSON() : mod.data;
    } catch (error) {
        errors.push(`${rel}: data.toJSON() threw — ${error.message}`);
    }
    if (json) {
        if (!json.description || json.description.length > DISCORD.maxDescription) {
            errors.push(`${rel}: command description is ${json.description?.length ?? 0} chars (needs 1-${DISCORD.maxDescription})`);
        }
        if ((json.options || []).length > DISCORD.maxOptions) {
            errors.push(`${rel}: ${json.options.length} top-level options (max ${DISCORD.maxOptions})`);
        }
        checkOptionTree(rel, json.options, 0);
    }

    // The loader only ever calls `execute`; anything else exported is unreachable.
    const reachable = new Set(['data', 'execute', 'category', 'name', 'once']);
    for (const key of Object.keys(mod)) {
        if (!reachable.has(key)) warnings.push(`${rel}: exports "${key}", which the loader never calls — dead code`);
    }
}

const permsMap = require(path.join(ROOT, 'lib', 'perms')).COMMAND_PERMISSIONS;
for (const name of Object.keys(permsMap)) {
    if (!commandNames.has(name)) {
        warnings.push(`lib/perms.js: '${name}' is in COMMAND_PERMISSIONS but no such command file exists`);
    }
}
for (const name of commandNames) {
    if (!(name in permsMap)) {
        warnings.push(`lib/perms.js: command '${name}' is not listed in COMMAND_PERMISSIONS (defaults to ungated)`);
    }
}

/* ── 6. events ───────────────────────────────────────────────── */
const eventCounts = new Map();
for (const file of walk(path.join(ROOT, 'events'))) {
    const rel = path.relative(ROOT, file);
    let mod;
    try {
        mod = require(file);
    } catch (error) {
        errors.push(`${rel}: failed to load — ${error.message}`);
        continue;
    }
    if (!mod?.name) errors.push(`${rel}: exports no event name`);
    if (typeof mod?.execute !== 'function') errors.push(`${rel}: exports no execute() function`);
    if (mod?.name) eventCounts.set(mod.name, (eventCounts.get(mod.name) || 0) + 1);
}

/* ── report ──────────────────────────────────────────────────── */
console.log(`\nValidated ${checked} files, ${commandNames.size} commands, ${eventCounts.size} event types.\n`);

for (const [name, count] of eventCounts) {
    if (count > 1) console.log(`ℹ️  ${count} handlers registered for "${name}"`);
}
console.log('');

if (warnings.length) {
    console.log(`⚠️  ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`   • ${w}`);
    console.log('');
}

if (errors.length) {
    console.log(`❌ ${errors.length} error(s):`);
    for (const e of errors) console.log(`   • ${e}`);
    console.log('');
    process.exit(1);
}

console.log('✅ Validation passed — no blocking issues found.\n');
