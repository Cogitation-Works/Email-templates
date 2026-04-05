# Cogitation Works Backend

This backend is now an Express + MongoDB service with a `server.js` entrypoint.

## Stack

- Express
- MongoDB Atlas / Compass
- JWT cookie auth
- Nodemailer SMTP
- Multer file uploads

## Seeded Super Admin

On startup the backend ensures this super admin exists in MongoDB:

- Name: `superadmin`
- Email: `info@cogitationworks.com`
- Password: `CW@dec032025`

This account is seeded in the database only. It is not meant to be hardcoded into the frontend UI.

## Run Locally

```powershell
cd "C:\Users\cogit\Desktop\Cogitation Works Email Template\backend"
npm install
npm run dev
```

The API runs on `http://localhost:8000` by default.

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
