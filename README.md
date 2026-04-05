# Cogitation Works Email Platform

This repo contains the internal outreach platform for Cogitation Works:

- React frontend rebuilt as a production-style internal workspace
- Express backend (`server.js`) with cookie auth, OTP verification, user management, audit logs, and email history
- MongoDB-backed storage for users, campaigns, logs, and templates
- Sender routing across Gmail SMTP, Sales Zoho, and Admin Zoho

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
4. Start the API with `npm run dev` or `node server.js`.

## Product notes

- The platform is sign-in only. No public signup flow exists.
- Login uses password + email OTP before the session cookie is issued.
- `Remember me` keeps the session active for 7 days.
- Password change is available from the login screen.
- Super admin can create users, edit users, set/reset passwords, grant team-history visibility, and see global campaign history.
- Users see `self` history by default and `others` history only when super admin grants access.
- Super admin can resend any campaign. Standard users can resend only from `self` history.
- Client lead emails include the company website and the pitch deck attachment.

## Frontend deployment

The frontend is a Vite SPA and is safe to deploy as a static app.

### Vercel

1. Import the project and set the root directory to `frontend`.
2. Build command: `npm run build`
3. Output directory: `dist`
4. Set `VITE_API_URL` to your deployed backend API URL.
5. `frontend/vercel.json` already includes the SPA rewrite for direct route access.

### AWS S3 / CloudFront

1. Build the frontend with `npm run build`.
2. Upload the contents of `frontend/dist`.
3. Configure SPA fallback so unknown routes return `/index.html`.
4. Set `VITE_API_URL` before building.

### Other static hosts

- Any host that serves the `dist` folder and supports SPA fallback to `index.html` will work.

## Verified

- `node -c backend\server.js`
- `tsc -p frontend\tsconfig.app.json --noEmit`
- `npm run build`
