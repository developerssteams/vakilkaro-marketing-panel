# Database Integration Later

The current Marketing Panel works with browser localStorage so you can use the full UI before PostgreSQL is connected.

When database work starts, keep the existing pages/components and replace `lib/marketing-local.js` calls with API routes and PostgreSQL repositories.

Suggested future tables:
- users / roles / sessions / permissions
- ad_accounts
- campaigns
- creatives
- ad_wallet_transactions
- marketing_leads
- audiences
- outreach_batches
- win_back_queue
- marketing_settings

Default admin login remains available through environment variables until you decide to seed the admin user in the database.
