# FastBillings deployment

## Required production secrets

Copy [`docker/.env.example`](docker/.env.example) to `docker/.env` and set:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Auth signing — use `openssl rand -hex 32` |
| `AI_ENCRYPTION_KEY` | Encrypts BYOK AI keys — `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | Matching strong DB password |
| `CORS_ORIGINS` or `FRONTEND_URL` | **Required in production** (comma-separated origins). API refuses to start without them. |
| `BASE_URL` | Absolute API public URL (emails, uploads, webhooks) |
| `SMTP_HOST`, `SMTP_USER` or `SMTP_EMAIL`, `SMTP_PASS` or `SMTP_PASSWORD`, `SMTP_FROM` | Transactional email |

Optional:

| Variable | Purpose |
|----------|---------|
| `ENABLE_SWAGGER=true` | Expose `/api/docs` (off by default) |
| `GOOGLE_CLIENT_ID` | Google Sign-In (must match frontend `VITE_GOOGLE_CLIENT_ID`) |
| `WHATSAPPCRM_SSO_SECRET` | HMAC for external SSO exchange |
| `VITE_DEMO_MODE=true` | Show demo login credentials in the tenant app (**dev/demo only**) |
| `SEED_ON_BOOT=true` | Runs **baseline** `prisma db seed` only (modules/roles). Never runs Kredmaxx demo full seed. |

## Seed policy

- **Production boot:** `docker-entrypoint.sh` runs `prisma migrate deploy` then optional baseline seed. It does **not** run `prisma:seed:demo` or `prisma:seed:demo:full`.
- **Demo / CodeCanyon preview:** manually run `npm run prisma:seed:demo` then `npm run prisma:seed:demo:full` in the API package after baseline seed.
- Rotate any seeded passwords (`Demo123$`, `SuperAdmin123$`) before exposing a public instance.

## GST / e-invoice honesty

- GSTR-1 / 3B / 9 / CMP-08 are **books worksheets**, not GSTN portal filing.
- E-invoice / e-way default to **mock** unless ClearTax/Masters credentials are configured in GST Compliance settings.
- Do not market “file GSTR” or “live IRN” until portal schemas and certified IRP are wired.

## Smoke checks after deploy

1. `GET /api/healthz` → 200  
2. Login as tenant admin  
3. Send a test invoice email (SMTP must be configured)  
4. Confirm `/api/docs` returns 404 unless `ENABLE_SWAGGER=true`  
5. Confirm MEMBER roles cannot delete invoices without permission  

## Local monorepo

```bash
npm run dev          # api + tenant + admin
npm run lint         # all packages
npm run test         # backend tests
npm run build        # all packages
```
