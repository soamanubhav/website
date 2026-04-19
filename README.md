# Website

## Why your blogs were not visible on iPad/mobile
Your previous setup was likely running in **localStorage-only mode** (no cloud credentials configured). In that mode, each device stores data separately, so posts created on laptop do not appear on phone/iPad.

This project now shows cloud status in Blog page header:
- `☁ Local only (not configured)` → not connected to database yet.
- `☁ Connected` / `☁ Connected (initialized)` → database is active.

---

## Connect to Supabase database (recommended)

### 1) Create table in Supabase
Run this SQL in Supabase SQL Editor:

```sql
create table if not exists public.blog_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.blog_state enable row level security;

create policy "public read blog_state"
on public.blog_state for select
using (true);

create policy "public write blog_state"
on public.blog_state for insert
with check (true);

create policy "public update blog_state"
on public.blog_state for update
using (true)
with check (true);
```

### 2) Add project credentials
1. Copy `blog.config.example.js` to `blog.config.js`.
2. Fill your real values:

```js
window.BLOG_CLOUD_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_KEY',
  table: 'blog_state',
  stateId: 'main'
};
```

> `blog.config.js` is git-ignored so your key is not committed.

### 3) Deploy both files
Make sure deployed site includes:
- `index.html`
- `script.js`
- `blog.config.js`

### 4) Verify
Open Blog page and check cloud badge:
- If badge says `☁ Connected`, edits should sync across laptop/iPad/mobile.
- You can click `⟳ Sync` button in Blog header to force a manual sync.

---

## Notes
- Images are stored as data URLs inside JSON; for large image-heavy blogs, use Supabase Storage in next phase.
- Current setup is simple/public-write for quick launch. For production-grade security, use auth-based RLS rules.
