# SocialEra Deployment Checklist

## Before Launch

1. Set backend environment variables.
   - `PORT`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`

2. Confirm Supabase settings.
   - Add your production site URL to Supabase Auth allowed URLs.
   - Verify signup, login, and account session flows on the production domain.

3. Verify product data.
   - Make sure `backend/products.json` contains the launch-ready catalog.
   - Confirm product images resolve correctly from the production host.

4. Run a manual QA pass.
   - Homepage feed loads
   - Shop loads products
   - Product page opens with variants
   - Cart updates correctly
   - Checkout prefills saved shipping data for logged-in users
   - Signup and register both create users
   - Login redirects to account
   - Admin login works with production credentials
   - Admin create/edit/delete product works

## Deployment Shape

This project is currently simplest to deploy as:

- one Node/Express backend from `backend/server.js`
- static frontend served by that same Express server from `frontend/`
- Supabase handling authentication

## Start Command

From `backend/`:

```bash
npm start
```

## Environment Example

Use `backend/.env.example` as the template:

```env
PORT=5001
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-password
```

## Current Blocker To Final Deploy

A real hosting target still needs to be chosen, for example:

- Render
- Railway
- Fly.io
- VPS / DigitalOcean

Once the target is chosen, map the same env vars there and point the app at the deployed domain.
