# Cycle — Operating Guide

A single-file calisthenics app: 15-minute sessions on a 4-day rotation, with
login and cross-device sync through Supabase.

| | |
|---|---|
| **Live** | https://mrezarf.github.io/Calis-App/ |
| **Repo** | https://github.com/mrezarf/Calis-App (public) |
| **App** | `index.html` — one self-contained file, ~2 MB, no build step |
| **Backend** | Supabase project `ocwkqaeohozovjvykeoq` |

Everything is already deployed and wired up. Section 1 is the day-to-day; the
rest is reference for when something breaks or you rebuild from scratch.

---

## 1. Updating the app

Edit `index.html`, then:

```bash
git add index.html
git commit -m "Describe the change"
git push
```

GitHub Pages rebuilds in 1–2 minutes. To confirm the new version is actually
being served rather than a cached one:

```bash
curl -s "https://mrezarf.github.io/Calis-App/?cb=$RANDOM" | wc -c
```

Compare that byte count against your local `index.html`. If they match, the
deploy landed.

> The whole app — markup, styles, script, exercise GIFs and the app icon — lives
> in that one file. GIFs and the icon are embedded as base64 data URIs, which is
> why it is 2 MB. There is nothing to bundle or compile.

---

## 2. What's in the current build

Worth knowing before you change things, because several of these are load-bearing.

**Appearance.** Light and dark palettes with a toggle in the header (sun/moon).
Dark is the default, and `data-theme="dark"` is set on `<html>` in the markup so
the first paint is never the wrong appearance. The choice is stored per device
under `clsx_theme`.

**Colour.** The four day hues (`#F2555C` push, `#17D9AE` pull, `#4C86F0` legs,
`#F5A928` core) are the identity colours. Text and button fills use *derived*
variants — `--push-text`, `--push-fill`, `--push-on-fill` and so on — because the
raw hues were drawn for a dark background and sit near 3:1 on white. Every
pairing clears WCAG AA 4.5:1 in both appearances. **If you change a hue, change
its derived variants too, or you will silently break contrast.**

**Glass.** Cards and the dialog backdrop use `backdrop-filter`, each inside an
`@supports` block with a solid fallback. Pills and chips get a gradient sheen
instead — deliberately *not* `backdrop-filter`, because they sit inside cards
that already have one, and nesting backdrop filters makes the blur smear on
repaint. The gloss rules sit last in the stylesheet on purpose: the component
rules use the `background` shorthand, which resets `background-image`.

**Screen wake lock.** The display stays awake for the length of a workout.
Requires a secure context, so it works on the live HTTPS site but is inert over
plain `http://` on a LAN address. Feature-detected; needs iOS 16.4+.

**Offline.** With no network the app runs from its local cache. A save that fails
is retried automatically when the connection returns.

---

## 3. Data and sync

Progress is stored in two places:

- **`localStorage`** under `clsx_state_v2` — per device, works offline.
- **Supabase** table `progress` — one row per account, keyed by `user_id`.

On launch the app reads the cloud row and caches it locally. **It writes nothing
on startup**, so opening a new build can never overwrite what is stored. If the
cloud read fails, it falls back to the local cache rather than resetting.

Changing `STORAGE_KEY`, the shape of `defaultState()`, or the table and column
names will orphan existing progress. Don't, unless you intend to migrate it.

### The table

Already created. This is the definition, for reference or rebuilding:

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

Three details that older guides get wrong:

- `to authenticated` stops the policies being evaluated for anonymous visitors.
- `(select auth.uid())` is evaluated once per query instead of once per row —
  Supabase's own RLS performance recommendation.
- The update policy needs **both** `using` and `with check`. With only `using`,
  an update could rewrite the row to a different `user_id`.

Row Level Security is what keeps your data private even though the site is
public. It is not the repo visibility doing that work.

### Credentials

Both values are already in `index.html` near the top of the `<script>` tag:

```js
var SUPABASE_URL = "https://ocwkqaeohozovjvykeoq.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_...";
```

The publishable key is **designed to be public** — that is why it can sit in a
public repo. Security comes from the RLS policies above.

- **Project URL** → Supabase → Settings → **Data API**
- **Publishable key** → Supabase → Settings → **API Keys**
  (older projects show this as the `anon` JWT starting `eyJ...`; either works)
- ⚠️ Never use the **secret** / `service_role` key in client code. It bypasses RLS.

### Signups are closed

New account creation is **disabled** (`disable_signup: true`). Your account works
normally and you can log in on any device; nobody else can register. To reopen
it: Supabase → Authentication → Sign In / Providers → *Allow new users to sign
up*. Verify the actual state rather than trusting the dashboard:

```bash
curl -s "https://ocwkqaeohozovjvykeoq.supabase.co/auth/v1/settings" \
  -H "apikey: <publishable-key>" | grep -o '"disable_signup":[a-z]*'
```

---

## 4. Install on iPhone

1. Open https://mrezarf.github.io/Calis-App/ in **Safari** (only Safari can
   install web apps to the Home Screen on iOS).
2. **Share → Add to Home Screen → Add.**
3. Launch it from the Home Screen — it opens full-screen with its own icon.

> **Changing the icon later?** iOS caches it per installed web app. Delete the
> existing tile and re-add it, or you will keep seeing the old icon no matter how
> many times you reload.

---

## 5. Troubleshooting

- **Login page doesn't appear / goes straight into the app** → one or both
  credentials still read `YOUR_...`. The login screen only activates once *both*
  the URL and the key are filled in.
- **"Invalid login credentials"** → wrong password, or the account doesn't exist.
  Signups are closed, so a new account can't be created without reopening them.
- **Data not syncing across devices** → confirm you're on the same account on
  both. A save that failed offline retries automatically on reconnect.
- **Logged in but nothing loads from the cloud** → usually a missing RLS policy.
  Check all three exist under Table Editor → `progress` → RLS. The app falls back
  to the on-device copy rather than showing an empty history.
- **Page 404s** → the file must be named exactly `index.html` at the repo root.
- **Screen dims during a workout** → needs iOS 16.4+ *and* HTTPS. It won't work
  over a plain-HTTP LAN address. iOS also drops the lock when you switch apps;
  it's re-acquired on return.
- **Sounds don't play until you tap** → browsers require a user gesture before
  audio. Tapping Start satisfies it.
- **Favicon looks stale on desktop** → browsers cache favicons separately from
  the page, so a hard reload won't refresh one. Load the URL with a query string
  (`?v=2`) to force it.

---

## 6. Rebuilding from scratch

Only needed if you start a new Supabase project or a new repo.

1. **Supabase** → new project → SQL Editor → run the `create table` block in
   section 3 → Authentication → Providers → enable Email and turn **off**
   "Confirm email" for instant login.
2. Copy the Project URL and publishable key into `index.html` (section 3).
3. **GitHub** → create a repo, then:
   ```bash
   git init && git add index.html && git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
4. **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main`,
   folder: `/ (root)`.
5. Register your account on the live site, then turn **off** "Allow new users to
   sign up" to seal it.

> **The repo must be public.** On GitHub Free, Pages only publishes from public
> repositories — you cannot serve a site from a private repo without a paid plan.
> That's fine here: the source is visible, but your workout data is protected by
> the Supabase login and RLS, not by repo visibility. If you need the source
> private, deploy from a private repo via Cloudflare Pages or Netlify instead
> (both free), or upgrade to GitHub Pro.
