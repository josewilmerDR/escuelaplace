# Production demo seed (`scripts/seed-prod.mjs`)

A one-shot script that loads a **realistic live-demo dataset** straight into the **production**
Firebase project (`escuelaplace`) with the Admin SDK. Built for showing the platform to
interested people — it covers the **catalog + ranking + reviews** surface.

> The legacy `npm run seed` (`scripts/seed.mjs`) only targets the local **emulators**. This one
> targets the **cloud** and is gated behind an explicit `--yes`.

## What it creates

- **8 categories** with accurate `businessCount`.
- **9 schools** across all 7 provinces, in every verification state (`verified` / `pending` /
  `needs_reverification`) plus a verified school with **zero supporters** (empty state). Private
  payment-methods subcollection included (one school keeps the legacy single-SINPE shape).
- **16 businesses** in every lifecycle status (`active` / `pending` / `draft` / `suspended`),
  with varied discounts, contact richness, hours, search tags and one co-editor.
- **10 support subscriptions** in every state: confirmed (fresh / decayed / renewed), expiring,
  expired, pending-with-proof, pending-without-proof.
- **~32 reviews** (authors are never the business owner/editor).

Function-maintained fields (`ranking`, `reviewStats`, school `metrics`, `countsForRanking`,
`businessCount`) are **precomputed** with the same math as `functions/src`, so the data is
correct the instant it lands. When the Cloud Functions are deployed they recompute the same
values and append `auditEvents` / `thankYous` on their own — the result converges.

Out of scope (not seeded): projects, project contributions, donor profiles, school tools
(bingo/raffle/sale/service/event/tour), thank-you templates.

## Ownership model

All pages belong to the **demo account** (`josewdr@gmail.com`) **or** to a distinct **synthetic
owner** (a Firestore-only `users/{uid}` doc — never an Auth account). This split is required:
production has the anti-fraud ranking gate, so a business's support only counts when it does
**not** share an administrator with the school it supports. If one account owned everything, the
ranking would render empty.

- **josewdr** owns the showcase: the well-supported school **Escuela Juan Rafael Mora Porras**
  (`esc-san-jose-centro`) and the business **Café del Valle** (which supports a *different*
  owner's school). Nothing josewdr owns is self-dealt.
- Every other page belongs to a synthetic owner, so all confirmed support crosses owners and
  lifts the ranking.

The script **resolves josewdr's real uid** from Auth by email — so that account must have signed
in to the production app at least once (or pass `OWNER_UID=<uid>`). Its `users/{uid}` doc is
**merged**, never overwritten: the demo pages are appended to whatever it already manages.

## Prerequisites

1. **Admin credentials** for the `escuelaplace` project (Application Default Credentials), one of:
   - `gcloud auth application-default login` (an account with Firestore + Auth Admin access), or
   - a service-account key JSON pointed at by `GOOGLE_APPLICATION_CREDENTIALS`.
2. josewdr has signed into production at least once (so the Auth account exists), **or** you have
   its uid for `OWNER_UID`.

## Run it

Validate offline first (no credentials, no writes — exercises the ranking math and the
owner/review integrity rules):

```bash
npm run seed:prod:check
```

Then seed production (PowerShell on Windows):

```powershell
# Credentials (pick one):
gcloud auth application-default login
# or: $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\ruta\serviceAccount.json"

npm run seed:prod -- --yes
```

bash / macOS / Linux:

```bash
gcloud auth application-default login
# or: export GOOGLE_APPLICATION_CREDENTIALS=/ruta/serviceAccount.json

npm run seed:prod -- --yes
```

Without `--yes` the script prints what it *would* do and exits (safe dry guard). It is
**additive and idempotent**: it only ever writes its own fixed, known ids, so re-running just
refreshes them — it never deletes or touches data it didn't create.

### Flags & env

| Flag / env | Effect |
| --- | --- |
| `--check` | Validate the dataset offline and print the ranking. No credentials, no writes. |
| `--yes` / `-y` | Required to actually write to (or clean) the cloud. |
| `--clean --yes` | Delete **only** the demo docs this script created (by their known ids), incl. subcollections. josewdr's account doc is kept (only its demo managed-pages are stripped). |
| `OWNER_EMAIL` | Demo account email (default `josewdr@gmail.com`). |
| `OWNER_UID` | Use this uid directly and skip the Auth email lookup. |
| `GOOGLE_CLOUD_PROJECT` | Override the target project (default: `.firebaserc` → `escuelaplace`). |

## Demo walkthrough

Sign in as `josewdr@gmail.com`, then:

| URL | Shows |
| --- | --- |
| `/` | Home feed (SSR) + re-rank after picking a school |
| `/search?q=cuadernos` | Keyword search over business tags |
| `/categories` | Category index with live counts |
| `/school/esc-san-jose-centro` | Verified school with 3 supporting businesses |
| `/school/esc-liberia` | `needs_reverification` (banner + payment data hidden) |
| `/school/esc-puntarenas` | `pending` (unverified) school |
| `/school/esc-san-carlos-rural` | Verified school with **no** supporters (empty state) |
| `/business/farmacia-vida-sana` | Strongest supporter (top ranking) |
| `/business/libreria-el-saber` | No support but top reviews (quality signal) |
| `/business/cafe-del-valle` | josewdr's business; support is `expiring` (renewal nudge) |
| `/panel` | The pages josewdr administers |

From the panel, josewdr can confirm the pending subscription, see the supporters queue, edit the
school / payment methods, and manage the business.

> Public pages are **ISR** (revalidate ~5 min). After seeding, force a refresh or wait for the
> next revalidation to see changes. If the Cloud Functions are deployed, ranking/reviews/metrics
> recompute within seconds of the writes and converge to the seeded values.

## To demo the **admin** surface (optional)

Verifying schools / reviewing audit events needs the `admin` custom claim. Grant it out-of-band
(this is separate from the seed):

```bash
cd functions
node scripts/set-admin.mjs josewdr@gmail.com
```

Then sign out and back in. See `docs/security/ADMIN-BOOTSTRAP.md`.
