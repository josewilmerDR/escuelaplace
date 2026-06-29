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

## 1. Backend: rules, indexes, functions

From the repo root:

```bash
# Build functions first (predeploy also does this, but verify locally)
npm --prefix functions ci && npm --prefix functions run build

firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

- `firestore:indexes` — creates the composite indexes (subscriptions, businesses).
  They may take minutes to build; queries 400 until ready.
- `functions` — deploys `onSubscriptionWritten`, `onReviewWritten`,
  `expireSubscriptionsDaily` (Gen 2). The schedule needs Cloud Scheduler (enabled above).
- `storage` + `firestore:rules` — the proof/reviews rules use `firestore.get()`, so deploy
  them together.

> **Order matters for the raffle arbiter.** `raffleOrders` creates are DENIED to clients — the
> `reserveRaffleNumbers` function is the sole creator (it enforces number uniqueness + a per-buyer
> cap the rules can't). A combined `firebase deploy` doesn't guarantee the function lands before the
> rules, so on the rollout that first introduces it (or any later change to it), deploy the function
> FIRST, then the rules — otherwise raffle buying breaks in the gap (no create path):
> ```bash
> firebase deploy --only functions:reserveRaffleNumbers
> firebase deploy --only firestore:rules
> ```

Verify in the console: Functions show all deployed; Firestore → Indexes all "Enabled".

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
- Subscribe a business to a school (pending) + upload a proof; confirm it as the school;
  verify the proof opens only for the business/school (not anonymous).
- Leave a review signed in; confirm the average updates (the function recomputed it).
- Check Functions logs for `onReviewWritten` / `onSubscriptionWritten` runs.

## Rollback

App Hosting keeps previous rollouts — promote a prior one from the console. Rules/indexes
are versioned in git; redeploy a previous commit's files if needed.
