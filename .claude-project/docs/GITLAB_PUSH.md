# Pushing Lead360 to GitLab — a step-by-step guide

Audience: the project owner, doing this for the first time. It assumes `git` is
already installed on your machine but that you have not used git or GitLab
before. Follow it top to bottom. Where a step is irreversible, it says so at the
step.

Commands are shown for **Git Bash** and **PowerShell**. They are identical
unless a step says otherwise. Every command block tells you which folder to run
it in — the project root is `d:\lead360`.

---

## 1. What git and GitLab actually are

Git is a program on your computer that takes snapshots ("commits") of a folder
so you can track changes and share them. GitLab is a website that stores a copy
of those snapshots online so other people can download them. "Pushing" means
uploading your commits from your machine to GitLab. Once something is pushed, a
copy exists on GitLab's servers and — if anyone has cloned it — on their
machines too, which is why leaking a secret by pushing is permanent.

---

## 2. Before you push — the irreversible part

**Create the GitLab project as Private. This is the single most important step.**
`backend/data/kb-seed/` contains Riseup's real past client proposals with real
pricing, and the head-cost sheet is Riseup's internal cost structure. This repo
must never be public.

1. Sign in at https://gitlab.com.
2. Click **New project** → **Create blank project**.
3. Name it (e.g. `lead360`).
4. Find **Visibility Level** and select the **Private** radio button. (Public
   means anyone on the internet can read it. You can loosen this later if there
   is ever a reason — but that is a deliberate decision, not a default.)
5. **Untick "Initialize repository with a README."** Your local folder already
   has files; if GitLab also creates a file, the two histories collide and your
   first push is rejected. Leave the checkbox empty.
6. Click **Create project**.

On the next page GitLab shows a URL like
`https://gitlab.com/your-username/lead360.git`. Keep that page open — you need
that URL in step 4.

> Pushing secrets is permanent. Making a repo Public later is reversible;
> un-leaking a key that has already been pushed is not. That is why the next
> step checks your safety net before anything leaves your machine.

---

## 3. Verify the safety net before committing

The project has a `.gitignore` file that tells git to never upload `.env` files
(which hold passwords and the OpenAI key). Confirm it is working **before** you
commit.

Run in `d:\lead360`:

```bash
git status
```

Read the list it prints. You should see `.env.example` files (those are safe
templates and are meant to be shared). You must **not** see any bare `.env`,
`backend/.env`, or `frontend/.env`. Those hold secrets.

Now confirm git is actively ignoring each real secret file. Run all three:

```bash
git check-ignore -v backend/.env
git check-ignore -v frontend/.env
git check-ignore -v .env
```

Each must print a line naming the rule that catches it, like:

```
.gitignore:16:**/.env	backend/.env
```

Read it as: "the rule on line 16 of `.gitignore` is ignoring `backend/.env`."
The line number does not matter — **what matters is that you get a line at all.**
If a command prints *nothing* and exits silently, that file is **not** ignored.

A stronger check — this lists every file git is about to upload whose name looks
like a secret. It should print only `.env.example` files:

```bash
git status --porcelain | grep -Ei '\.env|secret|credential|\.pem$|\.key$'
```

**If you see a bare `.env` in either check, stop. Do not commit.** It means the
file slipped past the ignore rules. Committing it now would bake the secret into
history, and history is what gets uploaded.

---

## 4. First commit and push

Run these in order, in `d:\lead360`.

```bash
# Turn this folder into a git repository. It ALREADY is one, so you will see
# "Reinitialized existing Git repository". That is fine and harmless.
git init

# The current branch is called "master". This renames it to "main", which is
# what GitLab expects by default.
git branch -M main

# Stage every file that is not ignored.
git add .

# REVIEW before committing. Read this list one more time — no .env files.
git status

# Take the snapshot.
git commit -m "Initial commit: Lead360 AI proposal and budget studio"

# Point your repo at the GitLab project. Paste the URL from step 2.
git remote add origin https://gitlab.com/your-username/lead360.git

# Upload it.
git push -u origin main
```

The `git push` step will ask you to authenticate — see the next section.

---

## 5. Authentication — use a Personal Access Token, not your password

gitlab.com does not accept your account password when pushing over HTTPS. You
create a token that acts as a password for git.

1. On gitlab.com go to your avatar (top-right) → **Edit profile** → **Access
   Tokens** (or open https://gitlab.com/-/user_settings/personal_access_tokens).
2. Click **Add new token**.
3. Give it a name (e.g. `lead360-laptop`) and pick an **expiry date** (a token
   that never expires is a standing risk; 90 days is reasonable).
4. Under **Scopes**, tick **`write_repository`**.
5. Click **Create personal access token**.
6. Copy the token immediately and keep it somewhere safe — GitLab shows it once.

When `git push` prompts you:

- **Username**: your GitLab username.
- **Password**: paste the **token** (not your account password).

On Windows, Git Credential Manager usually remembers the token after the first
successful push, so you should not be asked again.

---

## 6. What to expect during the push

The first push is roughly **40 MB or more** because `backend/data/` ships the
seed corpus and the rate-card spreadsheet. It may take a few minutes on a normal
connection. That is expected — let it finish.

GitLab's default per-project size limit is 5 GB, so this is nowhere near a
problem. (For reference: individual files over 100 MB would need a separate tool
called Git LFS. None of the files here are that large, so you do not need it.)

---

## 7. Add the developer to the project

1. In your project on GitLab, go to **Manage** → **Members**.
2. Click **Invite members**.
3. Enter the developer's GitLab username or email.
4. Set **Role** to **Developer**, then **Invite**.

Roles in one line each:

- **Guest** — can view issues, but not the code. Too little.
- **Reporter** — can read the code, but not push changes.
- **Developer** — can read the code and push branches. This is what your
  engineer needs.
- **Maintainer** — Developer plus project settings and member management. Give
  this only to someone you want administering the repo.

---

## 8. What the developer runs to get started

Send them the project URL. They run this (in whatever folder they keep code),
then follow the handoff doc:

```bash
git clone https://gitlab.com/your-username/lead360.git
# then open .claude-project/docs/DEVELOPER_HANDOFF.md and follow "Local setup"
```

---

## 9. Getting secrets to the developer — NOT through git

The repo deliberately contains no secrets. It ships `.env.example` files, which
are templates full of blanks. Your developer needs real values for:

| Variable | Where it comes from |
| --- | --- |
| `AI_API_KEY` | An OpenAI key you create at https://platform.openai.com/api-keys |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | The developer generates their own for local work |
| `DATABASE_PASSWORD` | Whatever they set in their local `.env` for Docker |
| `S3_*` | Only needed for staging/production |

Send the OpenAI key over something that is not git and not email-in-the-clear —
a password manager share, or 1Password. It is a billable credential.

**Rotate the current OpenAI key before anyone uses this in production.** It was
shared in plain text during development, so it should be considered exposed:
create a new key, put it in the production environment, then revoke the old one
from the OpenAI dashboard.

---

## 10. If something goes wrong

**Wrong remote URL** (typo, or you need to change it):

```bash
git remote set-url origin https://gitlab.com/your-username/lead360.git
```

**Push rejected with a message about the remote having changes** — this almost
always means the GitLab project was created *with* a README (step 2.5). Pull its
one file in and re-push:

```bash
git pull --rebase origin main
git push -u origin main
```

**You spot a `.env` in `git status` after committing but BEFORE pushing** —
remove it from the snapshot (this keeps the file on disk, only un-stages it),
then redo the commit:

```bash
git rm --cached backend/.env
git commit --amend -m "Initial commit: Lead360 AI proposal and budget studio"
```

**If a `.env` (or any secret) was already PUSHED** — deleting the file in a new
commit does **not** help. Anyone who fetched it, and GitLab's history, still
have it. You must **rotate the leaked secret**: generate a new OpenAI API key
and new `JWT_SECRET`/`JWT_REFRESH_SECRET`, and treat the old ones as
compromised. Rewriting git history does not un-leak a secret that has left your
machine.
