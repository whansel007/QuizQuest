# QuizQuest: Third-Party API Recommendations

> **Checked:** 2026-10-07. Prices and limits change often, so check again before you commit. Items marked **(unverified)** came from secondary sources or could not be confirmed on the vendor's own page.
> **Scope:** the prototype is moving to Vue 3 + Vite + axios on the frontend and Supabase Postgres as the database. The Node + Socket.IO World server stays.
> **PDPA:** the organisation stays responsible for overseas transfers of personal data, including to cloud providers acting as data intermediaries ([PDPC Transfer Limitation Obligation, ch. 19](https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Advisory-Guidelines/the-transfer-limitation-obligation---ch-19-(270717).pdf); [PDPC cloud guidance, ch. 8](https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Advisory-Guidelines/AG-on-Selected-Topics/Chapter-8-9-Oct-2019.pdf)). The rule throughout this document: **student identity stays in Singapore-region Supabase, and other services get course content or pseudonymous IDs only.**

## How this fits the recommended architecture

If QuizQuest keeps the Node API as the only thing that talks to Supabase (Vue → Node API → Supabase):

- **AI calls can stay in Node.** The Gemini key is already read from the server's `.env`. Edge Functions (1.4) are only needed if the frontend starts calling Supabase directly.
- **RLS is a second layer of defence.** It still matters (it protects data if a key or route leaks), but the Node API remains the main access check.
- **Realtime (1.6) and Cron (1.7) are optional add-ons.** They are useful whichever backend option is chosen.

---

## Summary

| Tier | API / service | Maps to | Receives student data? | Effort |
|---|---|---|---|---|
| Use now | Supabase Auth | Replaces the demo-user picker | Yes (stored in SG region) | M |
| Use now | Supabase Postgres + RLS (SG region) | All data, analytics, CSV export | Yes (SG region) | M (already planned) |
| Use now | Supabase Storage | PDF and diagram uploads | Course material only | S |
| Use now | Supabase Edge Functions | Server-side Gemini calls, key kept off the client | Course material, anonymous answers | S–M |
| Use now | pgvector + Gemini Embedding 2 | Better retrieval for AI question drafting | Course material only | M |
| Use now | Supabase Realtime (Broadcast, Postgres Changes, Presence) | Live market, teacher dashboards, lobby presence | Pseudonymous IDs | S–M |
| Use now | Supabase Cron | Pet, egg and market timers, nightly metrics | No | S |
| Next phase | LTI 1.3 Advantage (Canvas, Moodle, Brightspace) | Launch from the LMS, grade passback, rosters | Yes (from the LMS) | L |
| Next phase | Google Classroom API | Roster import, coursework, grade sync | Yes | M–L |
| Next phase | Microsoft Graph Education (Teams) | Classes, assignments, grade sync | Yes | M–L |
| Next phase | Vertex AI Gemini, `asia-southeast1` | Same AI features, processed in Singapore | Anonymous answers | M |
| Nice to have | Sentry | Error monitoring (frontend, Node, World) | Only if not scrubbed | S |
| Nice to have | PostHog | Product analytics, feature flags | Pseudonymous IDs | S |
| Nice to have | Cloudflare Turnstile | Bot protection on sign-up and login | IP and browser signals | S |
| Nice to have | Resend (or another SMTP provider) | Auth emails, digests | Email addresses | S |
| Nice to have | Open Trivia DB, Wikimedia REST API | Synthetic demo content | No | S |
| Nice to have | KaTeX + Compute Engine / math.js (libraries) | Maths rendering and answer checking | No (runs locally) | S |
| Nice to have | Web Speech API, Azure AI Speech | Read-aloud for accessibility | Question text only | S / M |

---

## Tier 1: Use now

These come with the Supabase migration, fit the free tier, and replace parts of the prototype that are currently fake or weak.

### 1.1 Supabase platform: region and free-tier facts
- **Region:** Southeast Asia (Singapore) `ap-southeast-1` is available. Other APAC regions are Mumbai, Tokyo, Seoul and Sydney ([Supabase regions](https://supabase.com/docs/guides/platform/regions)). **Pick Singapore when creating the project.** The region cannot be changed later without migrating.
- **Free plan limits** ([pricing](https://supabase.com/pricing)):
  - 500 MB database, 1 GB file storage, 5 GB egress
  - 50,000 monthly active users (MAU)
  - 500k Edge Function invocations
  - Realtime: 200 concurrent connections and 2M messages per month
  - At most 2 active projects
  - **Paused after 1 week of inactivity.** Data is kept, but someone has to restore the project from the dashboard.
  - **No automatic backups** and 1-day log retention.
- **Pro plan:** $25/month, which includes $10 of compute credit. Adds 7-day backups and stops the inactivity pausing. Move to Pro before any pilot with real users.
- **Prototype tip:** to stop a free demo project from pausing, put a scheduled ping in GitHub Actions. Do not rely on this for anything real.

### 1.2 Supabase Auth: replace the "pick a demo user" picker
- **What it does for QuizQuest:** real sign-in for professors and students. Roles (`professor`, `student`) go into a profile table and drive Row Level Security (RLS), so database policies, not the client, decide that a student cannot read the answer bank and only sees their own class. Supported sign-in methods include email OTP or magic link and Google or Microsoft OAuth. Social OAuth is on the Free plan; SAML 2.0 SSO is on Pro (50 SSO MAU included, then $0.015 per MAU), which matters later for school single sign-on ([pricing](https://supabase.com/pricing)).
- **Gotchas:**
  - The built-in email sender is only for testing. It allows roughly 2–4 auth emails per hour, so production needs a custom SMTP provider (see 3.4) **(unverified figure; secondary source)**.
  - The World's Socket.IO handshake should check the Supabase JWT instead of the current custom token.
- **PDPA:** identities live in the Singapore project. Collect the minimum: email plus display name, and let students use a nickname.
- **Effort:** M (auth flows, RLS policies for every table, World handshake).

### 1.3 Supabase Storage: course material
- **What it does:** stores uploaded PDFs, scanned pages and diagrams in a private bucket. RLS controls access per course, and the frontend gets short-lived signed URLs.
- **PDPA:** files are stored in the project region (Singapore). Scanned pages may contain personal data, so keep the existing "model flags personal data" check.
- **Effort:** S.

### 1.4 Supabase Edge Functions: server-side AI calls
- **What it does:** moves AI drafting, short-answer grading and vision OCR behind functions. The Gemini key is kept in Supabase secrets and never shipped to the Vue bundle.
- **Region:** functions run near the caller by default. Pin them to the database region with the `x-region` header or the supabase-js `region` option ([regional invocation](https://supabase.com/docs/guides/functions/regional-invocation)).
- **Security:**
  - Check the caller's JWT and role (professor only for drafting).
  - Return generic error messages.
  - Never log prompts that contain student answers.
- **Effort:** S–M. The REST calls already exist in Node and need porting to Deno/TypeScript.

### 1.5 pgvector + Gemini Embedding 2: better retrieval for AI drafting
- **Current state:** BM25 over chunks of about 700 characters.
- **Upgrade:** hybrid search. Postgres full-text search (`tsvector`, which plays the BM25 role) is combined with pgvector cosine similarity using reciprocal-rank fusion ([Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)). This finds paraphrased material that keyword search misses.
- **Model:** the current model is **`gemini-embedding-2`** (updated April 2026). It accepts text, image, video, audio and PDF, with an 8,192-token input limit and 128–3072 dimensions (768, 1536 or 3072 recommended). `gemini-embedding-001` is now listed as legacy and text-only. **The two models' vectors cannot be compared with each other, so switching means re-embedding everything** ([Gemini embeddings docs](https://ai.google.dev/gemini-api/docs/embeddings)). Embedding 2 also drops the `task_type` parameter and puts task instructions in the prompt instead.
- **Sizing for the 500 MB free database:** use 768 dimensions, stored as `halfvec` if you want about 1.5 KB per chunk. Tens of thousands of chunks fit comfortably.
- **Pricing:** the pricing page lists text at $0.20 per 1M tokens on the paid tier ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). **Uncertain:** a fetch of that page showed the same figure for the free tier, which may be a parsing error. Check this before relying on it. **Free-tier content may be used to improve Google's products; paid-tier content is not.**
- **PDPA:** embed **course material only**, never student answers. This works with synthetic data on the free tier. Use a paid key, or Vertex AI (2.4), before any real professor uploads.
- **Effort:** M (schema plus index, backfill job, hybrid SQL function, re-embed when material is edited).
- **Related:** the prototype's default `GEMINI_MODEL=gemini-2.5-flash` is still listed, but the pricing page now shows the Gemini 3.x Flash family (3.5, 3.7 and 3.8). Re-test drafting and grading quality before switching.

### 1.6 Supabase Realtime: complement Socket.IO, don't replace it
- **Features:** Broadcast (low-latency messages), Presence (who is online) and Postgres Changes (row-level change feeds). Private channels are authorised with RLS on `realtime.messages` ([authorization](https://supabase.com/docs/guides/realtime/authorization)).
- **Why it cannot run the World:**
  - The World is server-authoritative with a 20–60 Hz tick. Realtime has no server-side game loop; it is a relay.
  - Free limits are **100 messages/sec, 200 concurrent connections and 20 Presence messages/sec**. Pro raises these to 500/500/50 ([Realtime limits](https://supabase.com/docs/guides/realtime/limits)). One 30-student raid at 20 Hz already exceeds the free cap.
  - **Keep Socket.IO for the World.**
- **Where it does fit:**
  - **Class trading market:** Postgres Changes on the trades table gives live listings with no polling. The trade itself must still be a single server-side transaction (Postgres function, Edge Function or the Node API) to prevent duplicating items.
  - **Teacher dashboards:** live practice-session progress, the "answers to mark" queue, and notifications when AI drafts finish.
  - **Lobby presence:** who in the class is online, and raid-starting countdowns.
- **Effort:** S–M.

### 1.7 Supabase Cron (pg_cron): scheduled jobs
- **What it does:** egg hatch timers, pet decay, expiring market listings, and nightly evaluation-metric rollups, all without an always-on worker ([Supabase Cron](https://supabase.com/docs/guides/cron)). Data stays in the database.
- **Effort:** S.

---

## Tier 2: Next phase (schools and LMS integration)

All three of these bring **real student PII** into QuizQuest, so take only what is needed:
- Prefer the opaque LMS user ID plus a display name.
- Do not import emails unless a feature needs them.
- Write down where the data is stored (Supabase Singapore).
- Pilots need a data processing agreement with each school.

### 2.1 LTI 1.3 Advantage (Canvas, Moodle, Brightspace)
- **What it does:**
  - **Launch:** students open QuizQuest from the LMS with no separate login.
  - **Deep Linking:** professors embed a specific practice set in a course module.
  - **Assignment and Grade Services:** practice scores flow back to the LMS gradebook.
  - **Names and Role Provisioning Services:** class rosters sync automatically.
  - Source: [overview of the services](https://flat.io/developers/docs/lti/lti-1.3).
- **What's needed:**
  - An LMS admin at each institution registers QuizQuest as a tool: client ID, deployment ID, JWKS URL, and login/launch URLs. Moodle supports dynamic registration.
  - QuizQuest needs a public HTTPS endpoint and its own RSA key pair (generated at deploy time and kept in a secret store).
- **Library:** [ltijs](https://github.com/cvmcosta/ltijs) (Apache-2.0, not archived, v7 TypeScript rewrite, Express-based) fits the Node server. Its maintainer also sells LTIaaS, a hosted alternative. **That service would receive roster data, so it adds a third-party processor.**
- **PDPA:** Canvas and others let the course admin set privacy levels (for example anonymous or name-only). Ask for the minimum.
- **Effort:** L (protocol, key management, mapping LMS contexts to QuizQuest classes, gradebook mapping).

### 2.2 Google Classroom API
- **What it does:** import courses and rosters, post QuizQuest practice as coursework, and sync grades ([Classroom auth guide](https://developers.google.com/workspace/classroom/guides/auth)).
- **What's needed:**
  - Schools must be on Google Workspace for Education.
  - Roster and coursework scopes are classed as sensitive or restricted. A public app needs Google OAuth verification, and a security assessment for restricted scopes, before going past 100 users **(unverified detail; secondary source)**.
  - For a single partner school, an **Internal** app inside that school's domain avoids the review but needs the school admin's cooperation.
- **Effort:** M–L, mostly in verification paperwork.

### 2.3 Microsoft Graph Education APIs (Teams Assignments)
- **What it does:** read classes and rosters, create assignments, and sync grades for schools using Microsoft 365 and Teams ([Graph education overview](https://learn.microsoft.com/graph/api/resources/education-overview)).
- **What's needed:**
  - **The school's tenant admin must grant consent** once for the app's permissions.
  - Permissions are granular: `EduAssignments.ReadBasic.All` reads assignments without grades, and `EduAssignments.Read.All` includes grades ([permission reference](https://graphpermissions.merill.net/permission/EduAssignments.Read.All.html)). Request the smallest set.
- **Pairing:** Microsoft (Entra) sign-in through Supabase Auth OAuth covers SSO.
- **Effort:** M–L.

### 2.4 Vertex AI Gemini in `asia-southeast1` (production AI path)
- **Why:** the consumer endpoint, `generativelanguage.googleapis.com`, gives no regional processing guarantee. Vertex AI generative AI does its ML processing in the region you call, and Singapore has expanded data-residency commitments ([Vertex AI data residency](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency)). `gemini-embedding-001` is available in `asia-southeast1` ([availability tracker, third party](https://modelavailability.com/models/google/gemini-embedding-001)). Whether `gemini-embedding-2` is available there is **unverified**.
- **When:** before real student short answers go to AI grading, and before real scanned documents go to OCR.
- **Effort:** M (service account auth, a different endpoint shape).

**Singapore note:** many SG schools use MOE's Student Learning Space. No public third-party integration API was found as of the check date **(unverified; ask MOE or partner schools)**.

---

## Tier 3: Nice to have

### 3.1 Sentry: error monitoring
- **Maps to:** the Vue frontend, the Node API and the World server (desync and crash diagnosis).
- **Free Developer plan:** 5k errors/month, 50 replays, 1 user **(secondary source)**.
- **Data:** stored in the US (Iowa) or EU (Frankfurt). There is **no Singapore option**, and the choice cannot be changed later ([data storage location](https://docs.sentry.io/organization/data-storage-location/)).
- **PDPA:** set `sendDefaultPii: false`, scrub with `beforeSend`, mask all text in Session Replay, and never attach answer text or names.
- **Effort:** S.

### 3.2 PostHog: product analytics and feature flags
- **Maps to:** which gamification features drive practice (funnels: practice → coins → pets/World), A/B tests on the adaptive engine, and feature flags for staged rollout.
- **Free tier:** 1M events/month. Hosted in the US or EU, or self-hosted ([PostHog EU](https://posthog.com/eu)).
- **PDPA:** identify users only by pseudonymous UUID, turn off input capture in autocapture and session recording, and send no names or emails.
- **Effort:** S.
- **Note:** this is **product** analytics. Learning analytics stay in Postgres.

### 3.3 Cloudflare Turnstile: bot protection
- **Maps to:** public sign-up, login and password-reset forms once real auth exists. Supabase Auth has built-in captcha support for Turnstile and hCaptcha.
- **Free tier:** unlimited challenges, 20 widgets, 1M siteverify calls per month ([Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)).
- **Data:** Cloudflare processes IP address and browser signals. Mention this in the privacy notice.
- **Effort:** S.

### 3.4 Transactional email (Resend or equivalent SMTP)
- **Maps to:** Supabase Auth emails (magic links, OTP, resets), weekly practice digests, and "AI drafts ready" notices for professors.
- **Free tier:** about 100 emails/day **(secondary source)**.
- **PDPA:** the provider receives email addresses, which are PII. Check which hosting regions it offers and sign its data processing agreement.
- **Effort:** S (SMTP settings in the Supabase dashboard).

### 3.5 Open Trivia DB: synthetic demo content
- **Maps to:** seeding demo question banks quickly, for load-testing the adaptive engine and World raids with realistic multiple-choice and true/false items.
- **Details:** free, 24 categories, session tokens prevent repeat questions ([API config](https://opentdb.com/api_config.php)).
- **License:** CC BY-SA 4.0, so attribution is needed and share-alike applies to derived banks. Trivia is not curriculum-aligned, so use it for demos only.
- **Effort:** S (a one-off import script).

### 3.6 Wikimedia REST / Action API: demo course material
- **Maps to:** pulling page summaries or extracts as synthetic "course material" to test chunking, embeddings and AI drafting without real lecture notes.
- **Requirements:** a descriptive `User-Agent` header with contact details is required. New rate limits have been enforced since March–April 2026, and the API Portal docs are moving to mediawiki.org ([changelog](https://www.mediawiki.org/wiki/Wikimedia_APIs/Changelog)).
- **License:** content is CC BY-SA.
- **Effort:** S.

### 3.7 Maths rendering and answer checking (libraries, not APIs)
- **Maps to:** the maths-template question format and short-answer maths.
- **Libraries:**
  - **KaTeX** (MIT): fast client-side LaTeX rendering.
  - **CortexJS Compute Engine** or **math.js**: checks symbolic or numeric equivalence (for example, that `2x+2` equals `2(x+1)`) on the client or server.
- **PDPA:** these run locally, so no data leaves the app. This is the preferred option.
- **Effort:** S.

### 3.8 Text-to-speech for accessibility
- **Web Speech API** (`speechSynthesis`): built into browsers, free, no key needed. Some browsers' "online" voices may send text to the vendor, but that is only question text, not PII. **Effort:** S.
- **Azure AI Speech:** for consistent neural voices, including Singapore English. Free F0 tier gives 0.5M neural characters per month, and it can be deployed in the Southeast Asia region **(region and quota pairing unverified)**. Send question text only. **Effort:** M.

---

## Considered and not recommended

| API | Reason |
|---|---|
| **Quizlet API** | Closed: no new keys since Dec 2018, partner-only now ([background](https://apitracker.io/a/quizlet/products)). |
| **Wolfram\|Alpha API** | Paid beyond a small non-commercial dev allowance **(not re-verified)**, sends content to US servers, and local CAS libraries (3.7) already cover template answer checking. |
| **Firebase Realtime DB / Firestore** | Duplicates Supabase Realtime and Postgres, splits the data across two vendors, and complicates PDPA records for no gain. |
| **Supabase Realtime as the World engine** | No server-side tick, and the 100 msgs/sec free cap is below one 20 Hz class raid. Keep Socket.IO (see 1.6). |
| **Gemini API free tier with real student data** | Free-tier inputs may be used to improve Google products. Use the paid tier, or Vertex AI in `asia-southeast1`, before handling anything real. |

---

## Suggested order
1. Create the Supabase project in **`ap-southeast-1`**. Set up Auth, RLS and Storage. Keep the Gemini key in the server's environment (or in Supabase secrets if Edge Functions are used).
2. Add pgvector + `gemini-embedding-2` hybrid retrieval, embedding course material only.
3. Use Realtime for the market and teacher dashboards; keep Socket.IO for the World.
4. Add Sentry (scrubbed) and Turnstile + custom SMTP before any external user.
5. Move to Supabase Pro and Vertex AI (`asia-southeast1`) before a pilot with real students.
6. Do LTI 1.3 first for institution integration, then Google Classroom or Microsoft Graph depending on the partner school.

*No credentials or personal data are included in this document. All keys belong in environment secrets (Supabase secrets, CI secret store) and must never be committed.*
