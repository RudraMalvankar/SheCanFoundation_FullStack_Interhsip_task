# She Can Foundation Form

A MERN internship task for She Can Foundation.

## Features

- Name, email, and message form
- Validation on the client and server
- Success message after submit
- MongoDB persistence when `MONGO_URI` is provided
- Responsive, polished landing page
- Protected admin login and submissions dashboard
- JWT-based API authentication for admin routes

## Access

- Public form: `http://localhost:5173` in development
- Admin panel: `http://localhost:5173/admin` in development
- Production app: `http://localhost:5000`

## Admin Login

Set these values in the root `.env` file:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `JWT_SECRET`

If they are not provided, the app falls back to demo credentials for local development.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Make sure your root `.env` contains the required values.

3. Run the app in development:

   ```bash
   npm run dev
   ```

4. Build the frontend for production:

   ```bash
   npm run build
   ```

5. Start the server:

   ```bash
   npm start
   ```
