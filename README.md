# Hat Yai trip expenses

A shared expense tracker for the Hat Yai trip (Sat 7 – Mon 9 Nov 2026). Anyone with the link can add, edit and delete expenses; the page refreshes every 15 seconds to pick up what others add.

- `index.html`: the page (totals, spending by day, by category, paid by, expense list, add/edit form)
- `api/expenses.js`: a Vercel function that stores expenses in Upstash Redis
  - `GET /api/expenses`: list
  - `POST /api/expenses`: add
  - `PUT /api/expenses?id=…`: edit
  - `DELETE /api/expenses?id=…`: delete
- `api/rate.js`: today's MYR → THB rate (Frankfurter/ECB, falling back to ExchangeRate-API), cached for an hour

Each expense keeps the currency it was paid in (THB or RM), the rate used when it was saved, and an optional location pin (from the phone's GPS) with a place name looked up from OpenStreetMap. The page can show every total in baht or ringgit, and plots pinned expenses on a map.

## Deploy on Vercel

1. In Vercel, **Add New → Project** and import this repo. Keep the defaults (framework: Other) and click **Deploy**.
2. Open the project's **Storage** tab, choose **Upstash for Redis** (free plan), create it and connect it to this project.
3. Go to **Deployments**, open the latest one and click **Redeploy** so the function picks up the database keys.

The function reads `KV_REST_API_URL` / `KV_REST_API_TOKEN` (set by the Vercel integration) or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
