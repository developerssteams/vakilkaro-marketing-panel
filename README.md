# VakilKaro Marketing Panel

Ready-to-run Next.js Marketing Panel based on the existing VakilKaro panel shell.

## Default login
- User ID: `VKADMIN`
- Email: `admin@vakilkaro.com`
- Password: `VakilKaro@123`

## Run
```bash
npm i
npm run dev
```
Open `http://localhost:3000`.

## Current data mode
Marketing module records are stored in browser `localStorage`, so the panel works before a database is connected. PostgreSQL-related auth infrastructure is retained for later integration.

## Sidebar
- Dashboard
- Ad Accounts
- Campaigns
- ~~Creatives & Copy~~ (removed — ad preview + video play is now in Campaigns → Ads)
- Ad Wallet
- Lead Capture
- Audience
- Outreach
- Win-back Queue
- Analytics
- Settings

## Working now
- Default admin login/session/logout
- Responsive PHP-style sidebar/topbar
- Desktop sidebar collapse + mobile drawer
- Add/Edit/Delete/Search for marketing modules
- Status rotation where applicable
- Local persistence after refresh
- Dashboard KPIs derived from local module data
- Analytics summary
- Local settings + clear local data

## Database later
`lib/db.js` and DB-capable auth code are retained. Replace local module storage (`lib/marketing-local.js`) with API/database repositories when PostgreSQL is ready.
