# Live challenge targets

This pack contains four hard web/API targets and one very hard cryptography target.
Each challenge has a browser workspace backed by its live server-side API. The built-in request
console supports manual testing; Burp Suite is preferred for request inspection and replay.
The targets are intentionally vulnerable and are for this isolated CTF environment only.

## Start a local event

From the repository root, start the target services:

```sh
docker compose up -d
```

The five player-facing endpoints are published on ports `4101`–`4105` through fixed-upstream
ingress containers. The vulnerable services themselves stay on dedicated internal networks.
HookRelay's SSRF target, partner redirector and operations vault share only its private network.
Local published ports bind to loopback by default. For hosted deployment, use the repository-root
`render.yaml`; it publishes the five challenge services, keeps HookRelay's companion services
private, and connects the platform API to their URLs and flags. The targets are deliberately
separate public services, so use a dedicated Render workspace for a live event.

The FastAPI backend seeds the five challenge records automatically after its database schema
is initialized. To seed a local database manually, run this from the backend directory after
initializing the database:

```sh
cd backend
python seed_challenges.py
```

The seed updates the five named challenges in place and preserves player submissions. Render
generates each flag once and passes the same value to both the API seed and its challenge service.
The Render API disk and private HookRelay helper services require paid service plans.
Optional variables: `PROFILE_FLAG`, `LEDGER_FLAG`, `HOOKRELAY_FLAG`, `TOKENFORGE_FLAG`,
`CIPHERWORKS_FLAG`, `CHALLENGE_BASE_URL`, and per-target `PROFILE_URL`, `LEDGER_URL`,
`HOOKRELAY_URL`, `TOKENFORGE_URL`, `CIPHERWORKS_URL`. For local Compose events, put overrides
in the repository-root `.env` file for the challenge services; set the same flag variables in
the local backend process so its automatic seed matches.

## Challenge themes

| Challenge | Category | Main security lesson |
|---|---|---|
| ProfileSync: Trust Boundary Drift | API Security · Hard | Nested mass assignment and capability issuance |
| LedgerNorth: Cross-Tenant Invoice | API Security · Hard | Tenant-scoped object authorization and paginated change-feed isolation |
| HookRelay: Egress Policy Blind Spot | Web Security · Hard | Redirect chains and server-side request forgery |
| TokenForge: Header Algorithm Confusion | Web Security · Hard | JWT key selection, algorithm confusion, and issuer/audience validation |
| CipherWorks: Signature Key Recovery | Cryptography · Very Hard | ECDSA nonce failure, key recovery, and forged authorization |

These are original training scenarios informed by public vulnerability patterns and research;
they do not reproduce attacks against the named programs or systems. No challenge can
reliably prevent a participant from using an AI assistant. The targets require live HTTP
interaction and server-side exploit evidence, rather than frontend inspection or a static flag.
