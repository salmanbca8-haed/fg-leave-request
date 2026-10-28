# Employee Leave Portal

A responsive employee leave request portal for **Fuglide Innovation Intelligence Network** with live formal-letter preview, browser-generated PDF downloads, and a Gmail compose handoff. Opening a draft does not submit or approve a leave request.

**Live GitHub Pages URL:** [https://salmanbca8-haed.github.io/fg-leave-request/](https://salmanbca8-haed.github.io/fg-leave-request/)

## Requirements

- A modern browser with internet access
- The employee must be signed into their own Google/Gmail account to send from their personal account

## How it works

1. **Fill out the request:** Enter employee full name, ID, email, dates, leave type, and reason.
2. **Calculate duration:** Real-time calculation of calendar days, half-day, or hours.
3. **Preview formal letter:** Formally formatted company leave letter generated in real time.
4. **Submit the request:** With a configured backend, the request is stored in the shared admin inbox. On GitHub Pages without a backend, it is saved only in that browser's local storage; it is not sent to an administrator.
5. **Admin Review & Decision:** The administrator views the request in the Admin Dashboard, inspects the letter, and clicks **Approve** or **Not Approve**.
6. **Live Approval Notification & PDF Unlocking:**
   - While pending or if rejected, the employee's **"Download letter PDF"** button is disabled with a clear live status banner.
   - Once approved by the administrator, the status banner turns green ("Approved by Admin") and the **"Download Approved Letter PDF"** button unlocks immediately with the official approval endorsement.
   - With a backend, requests and decisions are shared through the server. In browser-local demo mode, changes sync only between tabs using the same browser profile and exact website origin.
7. **Track Status:** Employees can track any request at any time using their unique Reference ID.

## GitHub Pages Deployment

This portal is hosted statically on GitHub Pages:
- **Branch:** `main`
- **Publishing source:** `/(root)`
- **Entry point:** `index.html` at the repository root
- **Static assets:** `styles.css`, `app.js`, `admin.html`, `admin.js`, and `vendor/` are located at the repository root.
- **Jekyll bypass:** `.nojekyll` is present at the repository root to ensure direct static file delivery.
- The admin page opens directly in browser-local demo mode. Requests and settings stay in that browser and exact website origin; they are not shared with other browsers, devices, or `file://` pages.
- Shared submissions and approvals require deploying the Node.js backend; GitHub Pages cannot serve `/api` endpoints.

## Local Development & Node.js Server

The project includes an optional Node.js/Express server in `src/` for server-side SMTP email delivery and administrative settings persistence:

```bash
# Install dependencies
npm install

# Run automated validation and template tests
npm test

# Start the local development server (http://localhost:3000)
npm start
```

### Separately Hosted Backend (Optional)

When hosted statically on GitHub Pages, the portal runs 100% client-side. If you deploy the Node.js backend to a cloud host (Render, Railway, Fly.io, Heroku):
1. Configure `ALLOWED_ORIGINS=https://salmanbca8-haed.github.io` on the backend server.
2. Configure the backend HTTPS URL in the frontend deployment settings with `window.LEAVE_PORTAL_BACKEND_URL` or the `backend-api-url` meta tag in `index.html` and `admin.html`.