# Cycle — Setup & Deployment Guide

Everything needed to get the app live on GitHub Pages, wired to Supabase for login + cross-device sync, and installed on your iPhone. Written for a terminal workflow.

---

## 0. Prerequisites

- `git` installed (`git --version` to check)
- A GitHub account (you have this)
- A Supabase account (sign in with GitHub is fine)
- The app file: `calisthenics-app.html`

---

## 1. Set up Supabase (login + data sync)

### 1a. Create the project
1. Go to https://supabase.com → dashboard → **New Project**.
2. Name it anything, set a database password (save it, but you won't need it daily), pick a nearby region, create it. Wait ~2 min for provisioning.

### 1b. Create the data table
Open **SQL Editor** in the Supabase dashboard, paste this, and click **Run**:

```sql
create table public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.progress enable row level security;

create policy "select own" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

This creates the table the app saves to and locks it down with Row Level Security so each account can only read/write its own row. **This is what keeps your data private even though the site URL is public.**

Three details that matter and that older guides get wrong:
- `to authenticated` stops the policies from being evaluated for anonymous visitors at all.
- Wrapping the call as `(select auth.uid())` lets Postgres evaluate it once per query instead of once per row — Supabase's own RLS performance recommendation.
- The `update` policy needs **both** `using` and `with check`; with only `using`, an update can rewrite the row to a different `user_id`.

### 1c. Enable email login
- **Authentication → Providers → Email** → ensure Email is enabled.
- For personal use, toggle **OFF** "Confirm email" so you can register and log in instantly (no confirmation-link step). Leave it on if you prefer the extra verification.

### 1d. (Optional) Lock it to just you
After you register your own account (later, once deployed), come back to **Authentication → Providers → Email** and turn **OFF** "Allow new users to sign up." This seals the app so no one else can ever register — even though the login page is reachable.

### 1e. Copy your credentials
You need **two** values — the key alone is not enough, since it doesn't say which project to talk to. In the current dashboard they live on separate pages:

- **Project Settings → Data API** → copy the **Project URL** (`https://<project-ref>.supabase.co`).
- **Project Settings → API Keys** → copy the **publishable** key.
  - New projects show this as **Publishable key**, starting `sb_publishable_...`.
  - Older projects show it as the **anon public** key, a long JWT starting `eyJ...`.
  - Either format works — the app passes whatever you give it straight to the client.

> Can't find them? The **Connect** button at the top of the project dashboard shows both on one panel. The URL is also derivable from your browser's address bar: in `supabase.com/dashboard/project/<project-ref>`, that last segment is your project ref, so the URL is `https://<project-ref>.supabase.co`.
- ⚠️ Do NOT use the **secret** key (`sb_secret_...`) or the legacy `service_role` JWT. Those bypass Row Level Security and must never appear in client code. The publishable key is safe to embed — security comes from the RLS policies above, not from hiding the key.

### 1f. Paste credentials into the app
Open `calisthenics-app.html`. Near the top of the `<script>` tag you'll find:

```js
var SUPABASE_URL = "YOUR_SUPABASE_URL";
var SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Replace both placeholders with your real values and save.

> Note: until real credentials are in place, the app runs in local-only mode (no login screen, data saved only on that device). The mysterious login page only activates once Supabase is wired up.

---

## 2. Prepare the file for GitHub Pages

GitHub Pages serves `index.html` as the default page, so rename the app file:

```bash
# from the folder containing the file
mv calisthenics-app.html index.html
```

---

## 3. Push to GitHub (terminal)

### Option A — repo doesn't exist yet, using GitHub CLI (`gh`)
If you have the GitHub CLI installed and authenticated (`gh auth login`):

```bash
mkdir cycle-app && cd cycle-app
mv ../index.html .          # move the renamed file in
git init
git add index.html
git commit -m "Initial commit"
gh repo create cycle-app --private --source=. --push
```

### Option B — repo doesn't exist yet, plain git
1. Create an empty repo on github.com (the **+** menu → New repository → name it `cycle-app`, Private is fine, **don't** add a README). Copy its URL.
2. Then:

```bash
mkdir cycle-app && cd cycle-app
mv ../index.html .
git init
git add index.html
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cycle-app.git
git push -u origin main
```

### Updating later (after any edit)
```bash
git add index.html
git commit -m "Update app"
git push
```

---

## 4. Turn on GitHub Pages

1. In the repo on github.com: **Settings → Pages**.
2. Under **Build and deployment**: Source = **Deploy from a branch**, Branch = **main**, folder = **/ (root)**. Save.
3. Wait 1–2 minutes. The Pages screen will show your live URL, e.g.:
   ```
   https://YOUR_USERNAME.github.io/cycle-app/
   ```

> Note: On free GitHub accounts, GitHub Pages serves the built site **publicly** even if the repo is Private. That's fine here — your data is protected by the Supabase login, not by the repo visibility. If you need the *site itself* hidden (not just the data), use a host with password protection (Netlify/Vercel paid tiers) instead of GitHub Pages.

---

## 5. Install on iPhone

1. Open the live URL in **Safari** (must be Safari — other iOS browsers can't install web apps to the Home Screen).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch it from the Home Screen — it opens full-screen with its own icon.
4. Register / log in. Your data now syncs to Supabase and survives cache clears and works across every device you log into.

---

## 6. Quick reference — file/credential checklist

| Item | Where it comes from | Goes where |
|------|---------------------|------------|
| Project URL | Supabase → Settings → **Data API** | `SUPABASE_URL` in the HTML |
| Publishable (or legacy anon) key | Supabase → Settings → **API Keys** | `SUPABASE_ANON_KEY` in the HTML |
| Secret / service_role key | (do not use) | ❌ never in client code |
| `progress` table | SQL Editor block above | Supabase database |

---

## 7. Troubleshooting

- **Login page doesn't appear / goes straight into the app** → one or both credentials still say `YOUR_...`; paste real ones and re-push. The app only shows the login screen once *both* the URL and the key are filled in.
- **"Invalid login credentials"** → account not created yet (use Request access), or email confirmation is still on and unconfirmed.
- **Data not syncing across devices** → confirm the SQL from 1b ran without errors and you're logged into the same account on both devices. If a save fails while offline the app keeps the local copy and retries the push automatically when the connection returns.
- **Logged in but nothing loads from the cloud** → usually a missing RLS policy. Open **Table Editor → progress → RLS** and check all three policies from 1b exist; the app deliberately falls back to the on-device copy rather than showing an empty history.
- **Page 404s after enabling Pages** → the file must be named exactly `index.html` at the repo root; wait a couple minutes after enabling Pages.
- **Sounds don't play in preview but work when installed** → browsers require a user tap before audio; the installed app satisfies this on Start.
