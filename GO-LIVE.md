# Akanti: going live checklist

## Where to host (checked October 2026)

- **Cloudflare (recommended).** Free, unlimited bandwidth, 500 builds a month. Commercial use is
  allowed on the free plan according to comparison sources; confirm on Cloudflare's own terms when you sign up.
- **Vercel.** Fine for testing, but its free "Hobby" plan is **personal, non-commercial use only**
  (Vercel's own fair-use rules). Selling Akanti to customers needs their paid plan (about $20/month).

## Deploy on Cloudflare

1. Push this project to GitHub (see "Updating" below). Check `git status` never lists `.env.local`.
2. Cloudflare dashboard > **Workers & Pages** > **Import a repository** > connect GitHub > pick the repo.
3. Project name: it must match `name` in `wrangler.jsonc` (currently `sales-app`).
4. Build command: `npm run build`   Deploy command: `npx wrangler deploy` (the default).
5. Add two **build variables** (Vite bakes them in while building, so they must exist at build time):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`  (the public "anon" key; never the service_role key)
6. Deploy. You get an address like `<project-name>.<your-name>.workers.dev`.

## Tell Supabase the new address

Supabase > Authentication > **URL Configuration**:
- Site URL = your live address
- Redirect URLs = your live address AND `http://localhost:5173`

Without this, password-reset and confirmation emails send people to the wrong place.

## Before real customers

- [ ] Authentication > Sign In / Providers > Email: switch **Confirm email ON**
- [ ] Set up your own email sender (custom SMTP) in Supabase. The built-in one is heavily rate-limited
- [ ] Supabase free projects **pause after 1 week with no activity**. For paying customers use the Pro plan
- [ ] Open the live site on a phone: log in, make a sale, print or share a receipt, switch dark mode
- [ ] Open the browser console (F12). Messages starting "Content-Security-Policy" mean the report-only
      policy in `public/_headers` blocked something. If there are none after a few days of use,
      rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` to enforce it
- [ ] Replace the placeholder icons in `public/` with your real logo

## Updating after go-live

`git add .` then `git commit -m "what changed"` then `git push`. Cloudflare rebuilds and publishes
automatically. Phones with the old version open reload once by themselves.

## Install on a phone

- Android Chrome: menu > **Add to Home screen** (or Install app)
- iPhone Safari: Share > **Add to Home Screen**
