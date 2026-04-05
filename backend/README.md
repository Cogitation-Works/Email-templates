# Cogitation Works Backend Services

Backend services are used by serverless API handlers under the root `api` folder.

## Stack

- Express
- MongoDB Atlas / Compass
- JWT cookie auth
- Nodemailer SMTP
- Multer file uploads

## Super Admin Seeding

On startup, the backend ensures the super admin from environment variables exists:

- `SUPER_ADMIN_NAME`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`

## Run Locally

```powershell
cd "C:\Users\cogit\Desktop\Cogitation Works Email Template"
npm install
vercel dev
```

The API is available under `http://localhost:3000/api` with `vercel dev`.

To force-reset the seeded super admin row:

```powershell
npm run reset:superadmin
```

## Required Env

Copy `.env.example` to `.env` and set:

- `MONGODB_URI`
- `MONGODB_STANDARD_URI` (optional fallback when `mongodb+srv://` DNS lookup fails)
- `MONGODB_DB_NAME`
- `JWT_SECRET_KEY`
- SMTP values if live email should send
- `SCHEDULER_SECRET` (for `/api/scheduler/process`)

## Main Routes

- `POST /api/auth/login`
- `POST /api/auth/verify-otp`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/:userId`
- `POST /api/admin/users/:userId/resend-password`
- `DELETE /api/admin/users/:userId`
- `GET /api/admin/logs`
- `GET /api/leads/client-lead/templates`
- `POST /api/leads/client-lead/preview`
- `POST /api/leads/client-lead/send`
- `GET /api/leads/client-lead/history`
- `POST /api/leads/client-lead/sent/:recordId/resend`
- `POST /api/scheduler/schedule`
- `POST /api/scheduler/process`
