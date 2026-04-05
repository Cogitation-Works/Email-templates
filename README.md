# Cogitation Works Email Platform

This repo contains a single Vercel deployment setup with:

- Vite frontend in `frontend`
- Serverless API under `/api/*` (backed by shared backend services)
- MongoDB-backed storage for users, campaigns, logs, templates, and scheduled emails
- SMTP delivery with scheduler processing via GitHub Actions cron

## Project structure

- [`frontend`](/c:/Users/cogit/Desktop/Cogitation%20Works%20Email%20Template/frontend)
- [`backend`](/c:/Users/cogit/Desktop/Cogitation%20Works%20Email%20Template/backend)

## Frontend setup

1. Copy [`frontend/.env.example`](/c:/Users/cogit/Desktop/Cogitation%20Works%20Email%20Template/frontend/.env.example) to `frontend/.env`.
2. Install dependencies inside `frontend` with `npm install`.
3. Start the dev server with `npm run dev`.

## Backend setup

1. Copy [`backend/.env.example`](/c:/Users/cogit/Desktop/Cogitation%20Works%20Email%20Template/backend/.env.example) to `backend/.env`.
2. Fill the backend env with your real super admin, SMTP, and MongoDB values.
3. Install backend dependencies inside `backend` with `npm install`.
4. Use `vercel dev` from repository root for local full-stack behavior.

## Single Vercel deployment

This repo uses a root `vercel.json` to deploy both layers in one project:

- Frontend build source: `frontend/package.json` (Vite static build)
- API runtime: root `api/**/*.js` (serverless functions)
- API base path: `/api/*`

## Scheduled email processing

### API endpoints

- `POST /api/scheduler/schedule`
  - Stores scheduled email payload in MongoDB with status `pending`.
  - Required body fields: `email`, `subject`, `message`, `sendAt`.
- `POST /api/scheduler/process`
  - Requires secret auth (`x-scheduler-secret` header or `?secret=` query).
  - Processes due records where `sendAt <= now` and `status = pending`.
  - Sends via SMTP and updates status to `sent` on success.

### GitHub Actions cron

- Workflow: `.github/workflows/scheduled-email-dispatch.yml`
- Runs every 5 minutes and calls `/api/scheduler/process`.

## Required environment variables

Set these in Vercel (Project Environment Variables):

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_SENDER_EMAIL`
- `SCHEDULER_SECRET`

Set these in GitHub Actions Secrets:

- `SCHEDULER_URL` (example: `https://your-project.vercel.app`)
- `SCHEDULER_SECRET` (must match Vercel value)

## Product notes

- The platform is sign-in only. No public signup flow exists.
- Login uses password + email OTP before the session cookie is issued.
- `Remember me` keeps the session active for 7 days.
- Password change is available from the login screen.
- Super admin can create users, edit users, set/reset passwords, grant team-history visibility, and see global campaign history.
- Users see `self` history by default and `others` history only when super admin grants access.
- Super admin can resend any campaign. Standard users can resend only from `self` history.
- Client lead emails include the company website and the pitch deck attachment.

## Deployment note

- Frontend defaults to same-origin API calls (`/api`).
- Set `VITE_API_URL` only if you intentionally host frontend and API on different domains.

## Verified

- `node -c backend\server.js`
- `tsc -p frontend\tsconfig.app.json --noEmit`
- `npm run build`
