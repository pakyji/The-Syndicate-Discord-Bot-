# Termux se GitHub par upload karna

Poora flow phone se. Do hisse hain: **(A)** fixed code phone pe laana, **(B)** GitHub pe push karna.

> ⚠️ **Sabse pehle ye samajh lo:** Termux pe `npm install` chalaane se **music nahi chalega**.
> `ffmpeg-static` Android ke liye prebuilt binary download nahi karta, aur `@discordjs/opus`
> ka native build aksar fail hota hai. Isliye Termux ka kaam hai — **code edit karna, static
> checks chalana, aur push karna**. Bot apni hosting pe chalega, wahan `npm install` poora
> hoga aur music chalega. Ye guide usi hisaab se likhi hai.

---

## 0. Termux install (agar nahi hai)

**Play Store wala Termux purana hai aur update nahi hota.** F-Droid ya GitHub se lo:

* F-Droid: https://f-droid.org/packages/com.termux/
* GitHub: https://github.com/termux/termux-app/releases

```bash
pkg update -y && pkg upgrade -y
```

---

## 1. Zaroori packages

```bash
pkg install -y git openssh curl nano tar gzip
```

`gh` (GitHub CLI) optional hai — auth ke liye sabse aasaan, par zaroori nahi:

```bash
pkg install -y github-cli
```

Git ko apna naam batao (har commit pe lagta hai):

```bash
git config --global user.name  "pakyji"
git config --global user.email "tumhara-email@example.com"
git config --global init.defaultBranch main
git config --global core.editor nano
```

---

## 2. Phone ko shared storage ka access

```bash
termux-setup-storage
```

Ek popup aayega — **Allow** dabao. Iske baad `/sdcard/Download` padha ja sakta hai.

---

## 3. GitHub login

### Tarika 1 — `gh` CLI (sabse aasaan)

```bash
gh auth login
```

Sawaalon ke jawab:

| Sawaal | Jawab |
|---|---|
| What account? | **GitHub.com** |
| Preferred protocol? | **HTTPS** |
| Authenticate Git with your GitHub credentials? | **Yes** |
| How to authenticate? | **Login with a web browser** |

Ek **8-digit one-time code** dikhega. Use copy karo, browser apne aap khulega, code daalo,
Authorize dabao. Bas — `git push` ab bina password ke chalega.

Check:

```bash
gh auth status
```

### Tarika 2 — Personal Access Token (gh nahi chahiye)

1. Browser: https://github.com/settings/tokens → **Generate new token (classic)**
2. Scope: sirf **`repo`** (aur kuch nahi)
3. Expiry: 90 din theek hai
4. Token copy karo (`ghp_...`)

Phir:

```bash
git config --global credential.helper store
```

Pehli baar `git push` pe username aur **password ki jagah token** daalna. Uske baad yaad
rah jaayega.

> ⚠️ Token = password. `nano ~/.netrc` ya kisi script mein mat daalo jo commit ho jaaye.
> Kaam khatam hone pe https://github.com/settings/tokens se revoke kar dena behtar hai.

### Tarika 3 — SSH key

```bash
ssh-keygen -t ed25519 -C "tumhara-email@example.com"
# passphrase khaali chhod sakte ho (Enter, Enter)
cat ~/.ssh/id_ed25519.pub
```

Output copy karo → https://github.com/settings/keys → **New SSH key** → paste.

Test:

```bash
ssh -T git@github.com
# "Hi pakyji! You've successfully authenticated" aana chahiye
```

SSH mein remote URL aisa hoga: `git@github.com:pakyji/The-Syndicate-Discord-Bot-.git`

---

## 4. Code phone pe laana

Workspace se **`the-syndicate-v2.1.0.tar.gz`** (208 KB) download karo — ye poora fixed
tree hai, `node_modules` aur `.env` ke bina. Download folder mein jaayega.

```bash
mkdir -p ~/work && cd ~/work
tar xzf /sdcard/Download/the-syndicate-v2.1.0.tar.gz -C . 2>/dev/null || {
  mkdir -p syndicate && tar xzf /sdcard/Download/the-syndicate-v2.1.0.tar.gz -C syndicate
}
ls
```

Agar tarball kisi aur jagah hai to path badal do (`/sdcard/Download/` ki jagah).

**Verify karo ki transfer mein file tooti nahi.** Bundle ka apna sha256 iske andar nahi likh
sakta (wo self-referential ho jaata — har update pe badal jaata), isliye size aur contents
se check karo:

```bash
du -h the-syndicate-v2.1.0.tar.gz      # ~216 KB hona chahiye
tar tzf the-syndicate-v2.1.0.tar.gz | wc -l   # 106 entries
tar tzf the-syndicate-v2.1.0.tar.gz | grep -E 'package.json|index.js|lib/music.js|CHANGELOG.md|DEPLOY.md|TERMUX.md'
#    ^ ye sab dikhna chahiye
tar tzf the-syndicate-v2.1.0.tar.gz | grep -E '(^|/)\.env$|node_modules|store\.json'
#    ^ ye KUCH na dikhaye (secrets aur runtime data bundle mein hain hi nahi)
```

Exact sha256 chat message mein diya gaya hai — wo yahan se match kar lo. Size ya entry count
mismatch kare to dobara download karo, beech mein transfer toota hai.

**Extract ke baad bhi ek check:**

```bash
cd ~/work
node scripts/validate.js && node scripts/audit.js
#    dono pass hone chahiye — matlab koi file tooti ya chhooti nahi
```

---

## 5. Push karne se pehle checks (Termux pe ye chalega)

```bash
cd ~/work            # ya ~/work/syndicate, jahan package.json hai
ls package.json      # confirm karo sahi folder mein ho

npm install --ignore-scripts --no-audit --no-fund
```

`--ignore-scripts` **zaroori** hai: iske bina `@discordjs/opus` ka native build chalu hoga
aur Termux pe fail ho sakta hai. Isse pure-JS checks pe koi asar nahi padta.

Ab gate chalao:

```bash
npx eslint . -f compact          # kuch output na aaye = 0 problems
node scripts/validate.js         # "Validated 84 files, 46 commands" + passed
node scripts/audit.js            # "✅ clean" + 46 unique names
node scripts/test.js             # "274 passed, 0 failed"
```

> 📌 Termux pe `npm test` **274 passed, 0 failed** hi dega — bilkul hosting jaisa. Farq sirf
> itna hai ki ek assertion ki jagah ek **⏭️ skip** dikhega:
>
> ```
> ⏭️  voice stack incomplete on this host (ffmpeg binary absent — expected on Termux
>     and on `npm install --ignore-scripts`); music is correctly reported unavailable.
> ```
>
> Ye fail nahi hai. `ffmpeg-static` ka Android build hota hi nahi, isliye Termux pe music
> sach mein nahi chal sakta — aur test wahi honestly report karta hai. Ye suite dono
> tarah ke install pe verify kiya gaya hai: poora (274/274) aur degraded (274/274 + 1 skip).
>
> Agar `node scripts/test.js` bole *"Refusing to run: data/store.json already contains real
> data"* — ye safety guard hai, bug nahi. Iska matlab us folder mein pehle se real bot data
> hai. Use hatao mat; doosre folder mein kaam karo, ya `mv data/store.json ~/store.backup.json`.

---

## 6. Push

### Route A — poora fixed tree ek commit mein (recommended)

```bash
cd ~/work

git init -b main
git remote add origin https://github.com/pakyji/The-Syndicate-Discord-Bot-.git
#  SSH use kar rahe ho to:
#  git remote add origin git@github.com:pakyji/The-Syndicate-Discord-Bot-.git

# Apni existing history adopt karo, taaki push fast-forward ho, force-push na ho
git fetch origin main
git reset --soft origin/main
git read-tree origin/main

git add -A

# ⭐ COMMIT KARNE SE PEHLE REVIEW KARO
git status --short | head -60
git ls-files | grep -E '^\.env$|node_modules|store\.json|\.patch$'
#    ^ ye command KUCH output na de. Agar de, to wo cheez stage ho gayi hai
#      jo nahi honi chahiye — ruk jao.

git ls-files | grep -E 'package-lock.json|CHANGELOG.md|DEPLOY.md|data/.gitkeep|lib/music.js'
#    ^ ye paanchon dikhne chahiye

git diff --cached --stat | tail -3
#    ~ 103 files changed, ~15,400 insertions(+), ~3,600 deletions(-)
```

Sab theek lage to:

```bash
git commit -m "feat: music, version announcements, and the full audit fix (v2.1.0)"
git push origin main
```

Agar `origin/main` na mile (khaali repo), to `fetch`/`reset`/`read-tree` chhod do aur
`git push -u origin main` karo.

### Route B — patch lagao (existing clone pe)

Agar tumne repo pehle se clone kiya hua hai:

```bash
cd The-Syndicate-Discord-Bot-
git apply --check the-syndicate-fixes-full.patch   # dry run, kuch output nahi
git apply the-syndicate-fixes-full.patch
git add -A
git commit -m "feat: music, version announcements, and the full audit fix (v2.1.0)"
git push
```

Patch files workspace ke `/home/user/patches/` mein hain — unhe bhi phone pe transfer karna
padega (tarball ke alawa).

---

## 7. Push ke baad

```bash
gh api repos/pakyji/The-Syndicate-Discord-Bot- --jq '.pushed_at, .default_branch'
```

Ya browser mein repo kholo — naya commit dikhna chahiye.

**Hosting pe:**

```bash
cd /path/to/bot
git pull
npm install        # ⚠️ is baar ZAROORI hai — voice stack ke naye deps hain
npm run gate       # hosting pe poora pass: lint 0, validator clean, audit clean, 274/274
npm start          # ya: pm2 restart syndicate
```

Bot online aate hi, kyunki `package.json` ka version `2.0.0` → `2.1.0` hua hai, wo apne
aap `ANNOUNCE_CHANNEL_ID` mein **"🟢 The Syndicate is LIVE"** + `@everyone` + changelog
bhej dega. Uske baad wahi version dobara restart karne pe kuch nahi bhejega.

`.env` mein ye add karna mat bhoolna:

```ini
ANNOUNCE_CHANNEL_ID=<tumhare announcements channel ka ID>
MUSIC_ENABLED=true
```

Aur developer portal mein **Message Reaction Intent** enable karo, warna bot start hi nahi
hoga (`UsedDisallowedIntents`).

---

## 8. GitHub ka About set karna

About repo mein nahi, GitHub pe store hota hai. Phone ke browser se:

repo → **⚙️** (About ke bagal mein, top-right) →

**Description:**
```
The Syndicate — a Discord community bot: moderation, verification, economy, giveaways, native polls and YouTube music. Every ID configurable via .env, atomic persistence, permission gates enforced at registration and at dispatch.
```

**Topics:** `discord` `discord-bot` `discord-js` `moderation` `economy` `music` `giveaway` `verification` `javascript` `nodejs`

Ya Termux se (agar `gh` login hai):

```bash
gh repo edit pakyji/The-Syndicate-Discord-Bot- \
  --description "The Syndicate — a Discord community bot: moderation, verification, economy, giveaways, native polls and YouTube music." \
  --add-topic discord,discord-bot,discord-js,moderation,economy,music,giveaway,verification,javascript,nodejs
```

---

## 9. Agar atak jao

| Problem | Hal |
|---|---|
| `Permission denied (publickey)` | SSH key add nahi hui, ya HTTPS remote pe SSH URL hai. `git remote -v` dekho |
| `Authentication failed` / `403` | GitHub ne password auth band kar di hai — PAT ya `gh auth login` use karo |
| `Updates were rejected because the remote contains work` | `git pull --rebase origin main` phir `git push` |
| `fatal: refusing to merge unrelated histories` | Route A mein `git read-tree origin/main` chhoot gaya |
| `npm ERR! gyp` / `node-gyp` errors | `npm install --ignore-scripts` use karo (Termux pe native build ki zaroorat nahi) |
| `Cannot find module 'discord.js'` | `npm install` chalaana bhool gaye |
| Push ho gaya par `.env` bhi chala gaya | **Turant** Discord token reset karo: developer portal → Bot → Reset Token. Phir `git rm --cached .env && git commit -m "remove .env" && git push` |
| `error: failed to push some refs` + branch naam | `git push origin HEAD:main` |
| Termux kill ho jaata hai background mein | Termux settings → "Acquire wakelock", ya `termux-wake-lock` chalao |
| File `/sdcard` se nahi mil rahi | `termux-setup-storage` chalaya? Permission Allow kiya? |

---

## 10. Ek line mein

```bash
pkg install -y git openssh gh && termux-setup-storage && gh auth login
mkdir -p ~/work && cd ~/work
tar xzf /sdcard/Download/the-syndicate-v2.1.0.tar.gz
npm install --ignore-scripts --no-audit --no-fund
node scripts/validate.js && node scripts/audit.js
git init -b main && git remote add origin https://github.com/pakyji/The-Syndicate-Discord-Bot-.git
git fetch origin main && git reset --soft origin/main && git read-tree origin/main
git add -A && git ls-files | grep -E '^\.env$|node_modules|store\.json'   # kuch output NA aaye
git commit -m "feat: music, version announcements, and the full audit fix (v2.1.0)"
git push origin main
```
