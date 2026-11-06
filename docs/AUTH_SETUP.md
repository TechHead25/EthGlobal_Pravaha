# Authentication, Roles & Application Setup

This guide covers the web application's Google sign-in, PostgreSQL role store, role-approval workflow, and the security model that separates **application identity**, **wallets**, and **on-chain permissions**.

> **Invariant:** Application roles control access to web workspaces and off-chain workflows only. They never grant the ability to move escrowed funds. Fund movement is decided exclusively by `OpenAidEscrow` on-chain.

---

## 1. Architecture

| Concern | Mechanism | Authoritative source |
| --- | --- | --- |
| Who is signed in | Google OAuth via Auth.js v5 (`next-auth@5.0.0-beta.29`) | Encrypted, HTTP-only session cookie carrying only the internal user id |
| What they may do in the app | Roles + permissions (`src/lib/auth/roles.ts`) | PostgreSQL, reloaded on **every** request |
| Organization verification | `Organization.status` (`PENDING_REVIEW` / `VERIFIED` / `REJECTED`) | PostgreSQL, reviewed by an admin |
| Which wallet signs | Browser wallet (EIP-1193) | The user's wallet |
| What a wallet may do on-chain | Contract rules (validator set, winning vendor, deposits) | `OpenAidEscrow` on Arc Testnet |
| Validator human uniqueness | World ID proof → nullifier bound to account | World ID API + `WorldIdNullifier` unique index |

Key properties:

- The session JWT contains **no roles**. Tampering with cookies, local storage, JWT claims, or request payloads cannot grant privileges.
- A new Google account always starts with only `USER`.
- Middleware (`src/middleware.ts`) only redirects signed-out visitors. Authorization is enforced again in every server component (`requirePrincipal`), every route handler (`privateRoute`), and every service function (`src/server/authz-service.ts`).
- Google access/refresh tokens are never stored. Sign-in never requests a wallet signature.

## 2. Role & permission matrix

| Permission | USER | DONOR | NGO | VENDOR | VALIDATOR | ADMIN |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Browse public pages (no sign-in needed) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `dashboard:view`, `role:request`, `organization:manage_own` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `donor:view`, `donor:refund` | | ✓ | | | | |
| `ngo:view`, `ngo:campaign_create` | | | ✓ | | | |
| `vendor:view`, `vendor:bid`, `vendor:evidence_submit` | | | | ✓ | | |
| `validator:view`, `validator:vote`, `validator:worldid_verify` | | | | | ✓ | |
| `admin:view`, `admin:review_requests`, `admin:manage_roles`, `admin:suspend_users`, `admin:verify_organizations`, `admin:view_audit`, `admin:view_health` | | | | | | ✓ |

A user may hold several roles. `ADMIN` deliberately does **not** inherit operational permissions (separation of duties). A `SUSPENDED` account has no permissions at all.

### How each role is obtained

| Role | Path | Requirements |
| --- | --- | --- |
| USER | Automatic on first Google sign-in | Google-verified email |
| DONOR | Self-service request (instant) | Becomes admin-reviewed if an admin ever revoked it from that user |
| NGO | Request → admin approval | A **VERIFIED** NGO organization owned by the requester |
| VENDOR | Request → admin approval | A **VERIFIED** VENDOR organization owned by the requester |
| VALIDATOR | Request → admin approval, or direct admin grant | Voting also requires World ID verification **and** a wallet in the contract's validator set |
| ADMIN | Operator CLI only | Infrastructure (database) access. Never via web or API |

Administrators cannot review their own requests or organizations, change their own roles or status, grant `ADMIN`, or suspend other administrators through the app. Every grant, revocation, suspension, verification decision, sign-in, and blocked sign-in is written to `AuditEvent`.

## 3. Google Cloud Console setup

1. **Project:** Open <https://console.cloud.google.com/>, then create or select a project for OpenAid.
2. **OAuth consent screen:** Go to *APIs & Services → OAuth consent screen* (also called *Google Auth Platform → Branding/Audience*).
   - User type: **External**, unless the app is restricted to a Google Workspace organization.
   - Enter the app name, support email, and developer contact. Add your production domain under *Authorized domains* once it is known.
   - Scopes: only the defaults `openid`, `email`, and `profile` are needed.
   - While in *Testing* status, add the Google accounts that may sign in as test users.
3. **OAuth client:** Go to *APIs & Services → Credentials → Create credentials → OAuth client ID*.
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google`
4. **Production** (once the domain exists): add `https://<your-domain>` as an origin and `https://<your-domain>/api/auth/callback/google` as a redirect URI. Do not guess a domain ahead of time.
5. Copy the **Client ID** into `AUTH_GOOGLE_ID` and the **Client secret** into `AUTH_GOOGLE_SECRET`. Store them only in your local `.env.local` (git-ignored) and in your hosting provider's secret manager. Never commit them.

## 4. Database setup (PostgreSQL)

Any PostgreSQL ≥ 13 works (local install, Docker, Neon, Supabase, RDS…).

```bash
# Example local container
docker run --name openaid-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=openaid -p 5432:5432 -d postgres:16

# .env.local
DATABASE_URL="postgresql://postgres:devpass@localhost:5432/openaid"

npm install            # runs `prisma generate` via postinstall
npm run db:migrate     # applies prisma/migrations (prisma migrate deploy)
```

The initial migration (`prisma/migrations/20261106000000_init`) also creates two partial unique indexes that Prisma cannot express in the schema:

- `RoleGrant_one_active_per_role`: at most one active grant per (user, role), which closes grant races.
- `RoleRequest_one_pending_per_role`: at most one pending request per (user, role).

Tables: `User`, `RoleGrant` (append-only ledger), `RoleRequest`, `Organization`, `WorldIdNullifier`, `AuditEvent`.

## 5. Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | server | ≥ 32-byte secret encrypting the session cookie (`npx auth secret`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | server | Google OAuth web client |
| `AUTH_TRUST_HOST` or `AUTH_URL` | server | **Required for self-hosted `next start`**. Without it, Auth.js fails closed with `UntrustedHost`. Not needed on Vercel or in `next dev`. |
| `DATABASE_URL` | server | PostgreSQL connection string |
| `WORLD_ID_APP_ID`, `WORLD_ID_ACTION`, `WORLD_ID_MINIMUM_LEVEL` | server | Validator World ID verification (falls back to the `NEXT_PUBLIC_` values) |
| `NEXT_PUBLIC_PROTOCOL_TIMING_MODE` | public | `DEMO` (short auction/challenge windows for testnet walkthroughs) or `PRODUCTION` |
| `NEXT_PUBLIC_SUPPORT_URL`, `NEXT_PUBLIC_SECURITY_CONTACT_URL`, `NEXT_PUBLIC_SOCIAL_URL` | public | Optional footer links, rendered only when set |

When any of `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, or `DATABASE_URL` is missing, `/auth/sign-in` lists the missing names (never their values) and shows no sign-in button. Sign-in is **never** simulated.

## 6. Provisioning the first administrator

1. The person signs in once with Google, which creates their `User` row with role `USER`.
2. An operator with database access runs:

```bash
npm run admin:grant -- --email person@example.org --reason "Initial platform operator"
# Revoke:
npm run admin:grant -- --email person@example.org --revoke --reason "Offboarding"
```

The change is audited with `actorId = null` and `via: "operator_cli"`, and takes effect on the person's next request.

## 7. Running locally

```bash
cp .env.example .env.local      # fill in AUTH_*, DATABASE_URL
npm install
npm run db:migrate
npm run dev                     # http://localhost:3000
```

Checks:

```bash
npm run lint
npm run typecheck
npm run test:auth               # RBAC, auth security, wallet/tx unit tests (no network, no DB)
TEST_DATABASE_URL=postgresql://…/openaid_test npm run test:db   # real-PostgreSQL store tests (disposable DB!)
npx hardhat test                # every suite, including contracts
npm run build
```

## 8. API surface (private)

All private routes return `Cache-Control: private, no-store`, reject cross-origin mutations (`Origin` must match `Host`), validate bodies with strict zod schemas, and mask internal errors.

| Route | Method | Permission | Rate limit |
| --- | --- | --- | --- |
| `/api/me` | GET | `dashboard:view` | — |
| `/api/role-requests` | POST | `role:request` | 10 / h |
| `/api/role-requests/[id]` | DELETE | owner only | 30 / h |
| `/api/organizations` | POST | `organization:manage_own` | 5 / h |
| `/api/organizations/[id]` | GET | owner or org reviewer (others get 404) | — |
| `/api/admin/role-requests` (+`/[id]` PATCH) | GET/PATCH | `admin:review_requests` | 120 / h |
| `/api/admin/organizations` (+`/[id]` PATCH) | GET/PATCH | `admin:verify_organizations` | 120 / h |
| `/api/admin/users` | GET | `admin:manage_roles` | — |
| `/api/admin/users/[id]/roles` | POST | `admin:manage_roles` | 120 / h |
| `/api/admin/users/[id]/status` | POST | `admin:suspend_users` | 60 / h |
| `/api/admin/audit` | GET | `admin:view_audit` | — |
| `/api/admin/health` | GET | `admin:view_health` | 60 / min |
| `/api/validator/world-id` | POST | `validator:worldid_verify` | 10 / 15 min |
| `/api/arkiv` | POST/PATCH | NGO, vendor, validator, or admin + same origin | 30 / h |
| `/api/verify-worldid`, `/api/cre-verify` | POST | public (pre-existing) | 20 / 30 per 15 min per IP |

## 9. Known limitations

- **Rate limiting is per server instance** (in-memory). Multi-instance deployments should back `src/server/rate-limit.ts` with a shared store such as Redis or Upstash.
- **Forbidden pages return HTTP 200 with a client-side redirect** to `/app/forbidden`. Next.js streaming (the workspace `loading.tsx`) turns server `redirect()` into a client redirect. No privileged data is rendered; API routes return proper 401/403.
- **Wallet ↔ account linking** is not implemented. Workspaces read on-chain data for whichever wallet is connected, and the wallet address in a role request is an unverified, informational claim.
- **Campaign metadata pinning** is not integrated. NGOs pin the generated JSON with their own IPFS provider and paste the CID.
- **Sub-vaults, backup awards, and validator epochs** are V2 features (`docs/V2_*.md`). The UI labels them as planned.
- **Chainlink CRE** runs as a local simulation, and **Gemini** document analysis is not integrated in this build. The admin health panel reports both truthfully.
