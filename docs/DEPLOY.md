# Production deploy runbook

The app is **Next.js (SSR/ISR)** on **Firebase App Hosting**, with the backend
(Firestore, Auth, Storage, Cloud Functions Gen 2) on the same Firebase project.

> Cloud Functions Gen 2 and App Hosting both require the **Blaze** (pay-as-you-go) plan.

## 0. One-time prerequisites

1. Firebase CLI and login:
   ```bash
   npm i -g firebase-tools
   firebase login
   ```
2. Confirm the target project (`.firebaserc` → `escuelaplace`):
   ```bash
   firebase use escuelaplace
   ```
3. Upgrade the project to **Blaze** (Firebase console → Usage and billing).
4. Enable APIs in Google Cloud (console or `gcloud`): Cloud Functions, Cloud Run,
   Cloud Build, Eventarc, Cloud Scheduler, Secret Manager, Artifact Registry,
   Maps JavaScript API, Places API.
5. Auth: in Firebase console → Authentication, enable **Google** sign-in and add the
   production domain(s) to **Authorized domains**.

## 1. Backend: functions & indexes → bootstrap the first admin → rules

Admin authority is anchored on an **unforgeable Auth custom claim** (`request.auth.token.admin`,
see [ADMIN-BOOTSTRAP.md](./security/ADMIN-BOOTSTRAP.md)). The security rules make admin depend on
that claim, so the order is **functions first, mint the first admin, rules last**. Skip the
bootstrap and you ship a working-looking app with **no admin** — and with no admin **no school can
be verified (its payment methods stay hidden) and no support/order can be confirmed**, so the
directory is inert. Do 1a → 1b → 1c in order.

### 1a. Build + deploy functions and indexes

From the repo root:

```bash
# Build functions first (predeploy also does this, but verify locally)
npm --prefix functions ci && npm --prefix functions run build

firebase deploy --only functions,firestore:indexes
```

- `functions` — `onSubscriptionWritten`, `onReviewWritten`, `expireSubscriptionsDaily`, the admin
  callables (`grantAdminRole`/`revokeAdminRole`), `reserveRaffleNumbers`, etc. (Gen 2). The daily
  schedule needs Cloud Scheduler (enabled in step 0).
- `firestore:indexes` — composite indexes (subscriptions, businesses). They may take minutes to
  build; matching queries 400 until each shows **"Enabled"** in the console.

### 1b. Bootstrap the FIRST admin — REQUIRED, before the rules deploy

No admin exists yet to call `grantAdminRole`, so mint the first one out-of-band with the Admin SDK.
Sign in to the production site once with the operator account first (so its `users/{uid}` doc
exists), then:

```bash
cd functions
gcloud auth application-default login            # an account with access to the project
node scripts/set-admin.mjs josewdr@gmail.com     # grants the `admin` custom claim + mirrors role
cd ..
```

Then **sign out and back in** on the site — the script revokes the user's refresh tokens so the new
claim only takes effect on the next login. Confirm an admin-only action works (the school-verification
controls appear at `/panel/admin`). Full detail + the post-launch "drop the role fallback" cleanup:
[ADMIN-BOOTSTRAP.md](./security/ADMIN-BOOTSTRAP.md).

### 1c. Deploy the security rules

`storage` + `firestore:rules` use `firestore.get()` and anchor admin on the claim minted in 1b, so
deploy them together, **last**:

```bash
firebase deploy --only firestore:rules,storage
```

> **Raffle arbiter ordering.** `raffleOrders` creates are DENIED to clients — the
> `reserveRaffleNumbers` function is the sole creator (it enforces number uniqueness + a per-buyer
> cap the rules can't). The 1a → 1c order already lands the function before the rules; keep that
> order on any **later change** to the function too (deploy `functions:reserveRaffleNumbers` before
> `firestore:rules`), or raffle buying breaks in the gap (no create path).

Verify in the console: Functions all deployed; Firestore → Indexes all **"Enabled"**.

## 2. App: Firebase App Hosting (Next.js)

### 2a. Create the secrets (once)

Each `NEXT_PUBLIC_*` value referenced in `apphosting.yaml` must exist in Secret Manager.
Set them with the real values from the production Firebase web app config
(console → Project settings → Your apps → SDK setup) and the Maps key:

```bash
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_API_KEY
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_PROJECT_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_APP_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
firebase apphosting:secrets:set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
# Only when turning on the pageant free "simpatía" vote — see docs/pageant-free-vote-golive.md.
firebase apphosting:secrets:set NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY
```

(`NEXT_PUBLIC_USE_EMULATORS`, `NEXT_PUBLIC_TRACK_INTERACTION_URL`, `NEXT_PUBLIC_CAST_APPLAUSE_URL`
and `NEXT_PUBLIC_SITE_URL` are plain `value:` entries in `apphosting.yaml`, no secret.)

### 2b. Create the backend and connect the repo

```bash
firebase init apphosting
```

- Pick region, connect the GitHub repo, and set the **live branch** to `main`.
- App Hosting reads `apphosting.yaml`, runs `npm ci && npm run build`, and serves the
  Next server. From then on, **every push to `main` builds and deploys** automatically.

Trigger the first rollout by pushing to `main` (or `firebase apphosting:rollouts:create`).

### 2c. Maps key restriction

In Google Cloud → Credentials, restrict `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to the
production domain(s) (HTTP referrers) and to Maps JavaScript + Places APIs.

## 3. Custom domain (escuelaplace.com)

Firebase console → App Hosting → your backend → **Add custom domain** →
`escuelaplace.com` (and `www`). Add the DNS records it shows at your registrar; TLS is
provisioned automatically. Then add the final domain to Auth **Authorized domains** (step 0.5).

## 4. Smoke test (production)

- Home `/` renders the explore feed (SSR) and re-ranks after picking a school.
- `/search?q=...` returns relevant results.
- Sign in with Google; create a business and a school page.
- **Admin (confirms the step-1b bootstrap took):** open `/panel/admin`, verify the school you
  created; its payment methods become visible. If `/panel/admin` is empty or denies you, the admin
  claim is not active — re-run step 1b and sign out/in.
- Subscribe a business to a school (pending) + upload a proof; confirm it as the school;
  verify the proof opens only for the business/school (not anonymous).
- Leave a review signed in; confirm the average updates (the function recomputed it).
- Check Functions logs for `onReviewWritten` / `onSubscriptionWritten` runs.

## Rollback

App Hosting keeps previous rollouts — promote a prior one from the console. Rules/indexes
are versioned in git; redeploy a previous commit's files if needed.
