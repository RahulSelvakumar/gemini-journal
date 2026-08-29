# Personal Gemini Journal

An authenticated web app where users sign in, brainstorm or journal with Gemini, and have
their conversations automatically summarized and saved — built as a **production-grade**
submission for the Google Gen AI APAC ideathon.

**Live app:** https://gemini-journal-1040501010782.asia-south1.run.app
**GCP project:** `gen-ai-academy-491119` (region: `asia-south1`)

## What this demonstrates

| Requirement | How it's met |
|---|---|
| User Authentication | Firebase Authentication (Google Sign-In), verified server-side on every request |
| Multi-turn AI Interaction | `gemini-3.5-flash-lite` via `@google/genai`, server-side only |
| Isolated Data Storage | Cloud Firestore under `users/{uid}/entries/{id}`, enforced by both security rules and server-side uid checks — zero cross-user leakage |
| Secure Key Management | Gemini API key lives only in Cloud Secret Manager, fetched at runtime by a least-privilege Cloud Run service account — never hardcoded, never shipped to the client |
| **Enhancement (Phase 3)** | **Voice Journal** — browser Web Speech API speech-to-text feeds the same authenticated Gemini pipeline, at zero extra infra cost |

## Architecture

```
Browser (Next.js client)
  │  Firebase Auth ID token (Bearer header)
  ▼
Cloud Run (Next.js server, stateless, autoscaled 0→3, dedicated SA)
  │  verifies ID token server-side (firebase-admin) — never trusts client-supplied uid
  │  per-user rate limit (Firestore-backed) before every Gemini call
  ▼
Gemini API (gemini-3.5-flash-lite)         Cloud Firestore (users/{uid}/entries)
  key fetched from Secret Manager                enforced by security rules + server checks
```

- **Auth boundary**: every `/api/*` route calls `requireUserId(request)`, which verifies the
  Firebase ID token and returns the uid. If the token is missing/invalid/expired → `401`,
  full stop. No route ever reads a uid from a query param, body field, or cookie.
- **Data isolation**: Firestore documents live at `users/{uid}/entries/{entryId}`, never a
  shared flat collection. `firestore.rules` independently enforces
  `request.auth.uid == uid` as defense-in-depth on top of the server-side check.
- **Secrets**: the Gemini API key is stored in Secret Manager (`gemini-api-key`). The Cloud
  Run service account `gemini-journal-run@...` has `roles/secretmanager.secretAccessor`
  scoped to that single secret only — not project-wide, not `roles/editor`.
- **Least privilege**: a dedicated service account was created for Cloud Run instead of
  using the default (Editor-scoped) compute service account, with only `datastore.user`,
  `secretmanager.secretAccessor` (single secret), `logging.logWriter`, and
  `monitoring.metricWriter`.
- **Rate limiting**: a Firestore-backed per-user counter caps requests per minute, so one
  user (or a bug) can't exhaust the shared Gemini free-tier quota during a live demo.
- **Containerized & stateless**: multi-stage Dockerfile → Next.js `standalone` build, runs
  as a non-root user, deployed to Cloud Run with autoscaling (0–3 instances) — no in-process
  session state, so it scales horizontally without sticky sessions.

## Resilience — learning from a past billing outage

A prior cohort submission was missed because a GCP billing account was silently disabled
and went unnoticed. This build treats that as a first-class production requirement:

- **Uptime monitoring**: a Cloud Monitoring uptime check polls `/api/health` on the Cloud
  Run URL every 5 minutes from 3 regions, wired to an alert policy that emails on failure.
- **Billing budget alert**: a $20 budget on the billing account (`Gemini Journal Safety
  Budget`) emails at 50%/90%/100% thresholds, so a runaway cost or an about-to-be-disabled
  account is caught before it takes the app down silently.

## Phase 1 deliverable — AI Studio "constitution"

See [`docs/ai-studio-system-instructions.md`](docs/ai-studio-system-instructions.md) for the
full custom system instructions pasted into Google AI Studio before any code was generated.
It codifies threat modeling, auth/authz rules, database isolation, secret management, secure
coding standards, and operability requirements that this app was built against.

## Manual setup steps still required (external console UI, not API-scriptable)

1. **Enable Google Sign-In provider**: Firebase Console → Build → Authentication → Sign-in
   method → enable **Google**, then add the Cloud Run domain
   (`gemini-journal-1040501010782.asia-south1.run.app`) under **Settings → Authorized
   domains**. (Firestore DB, security rules, web app config, IAM, Secret Manager, Cloud Run,
   uptime check, and budget alert were all already provisioned programmatically for this
   submission — this is the one first-time console click Google gates behind a human
   action; it cannot be scripted via any public API, confirmed via repeated
   `identitytoolkit.googleapis.com` calls.)

### Resolved: Gemini API `RESOURCE_EXHAUSTED` (judge-safety fix)

The original API key was created inside `gen-ai-academy-491119`, which has Cloud Billing
enabled — Google routes keys from billed projects to a paid "prepay" tier, and this
project's prepaid balance was depleted, so calls failed with `RESOURCE_EXHAUSTED`. That is
exactly the kind of failure a judge could hit mid-demo.

**Fix applied**: created a second, dedicated GCP project (`gemini-journal-freekey`) with
**no billing account attached**, enabled only `generativelanguage.googleapis.com` on it, and
issued a new API key there (restricted to that single API). Keys from unbilled projects use
Google's free tier instead of the prepay wallet. That key is now what's stored in
`gemini-api-key` in Secret Manager — verified end-to-end (Secret Manager fetch → 
`gemini-3.5-flash-lite` call → real response) before deploying. The Cloud Run service was
redeployed to pick up the new secret version. No app code or architecture changed — the key
material is still never hardcoded and still only resolved server-side via Secret Manager.

## Local development

```bash
cp .env.local.example .env.local   # fill in GEMINI_API_KEY for local-only testing
npm install
npm run dev
```

## Deploying

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_IMAGE=asia-south1-docker.pkg.dev/gen-ai-academy-491119/gemini-journal/app:latest,\
_FIREBASE_API_KEY=...,_FIREBASE_AUTH_DOMAIN=...,_FIREBASE_PROJECT_ID=...,\
_FIREBASE_STORAGE_BUCKET=...,_FIREBASE_SENDER_ID=...,_FIREBASE_APP_ID=... .

gcloud run deploy gemini-journal --region=asia-south1 \
  --image=asia-south1-docker.pkg.dev/gen-ai-academy-491119/gemini-journal/app:latest \
  --service-account=gemini-journal-run@gen-ai-academy-491119.iam.gserviceaccount.com
```

## Scaling & maintainability notes for judges

- Stateless Cloud Run service → horizontal autoscaling with no code changes.
- All persistent state lives in managed services (Firestore, Secret Manager) — the
  container itself can be destroyed/recreated/redeployed at any time with zero data loss.
- IAM is least-privilege per-service-account, not a shared broad-permission identity.
- Input validation (`zod`) on every API route rejects malformed requests before they reach
  Gemini or Firestore.
- Structured `console.error` logs (uid + error, never full user content or secrets) flow to
  Cloud Logging automatically on Cloud Run.
