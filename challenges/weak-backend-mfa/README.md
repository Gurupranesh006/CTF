# Challenge: Apex IAM - Live MFA Gateway Bypass

> **Category**: Web Security / Authentication Logic & State Inconsistency  
> **Difficulty**: Medium  
> **Points**: 250  
> **Target Service**: `http://localhost:4000` (Live Target)  
> **Flag Format**: `flag{...}`  
> **Reference**: [BePracticalTech - Here's How Weak Backend Code Leads to MFA Bypass (YouTube)](https://youtu.be/ln4dU-KJOQE)

---

## 🎯 Intelligence Briefing
An intelligence assessment revealed administrator credentials for **Apex IAM Solutions**:
* **Target Portal**: `http://localhost:4000`
* **Username**: `admin@apexvault.corp`
* **Password**: `Winter2026@Access!`

Apex IAM enforces a mandatory Multi-Factor Authentication (MFA) gate before granting administrative access. The 6-digit OTP code is dispatched directly to the administrator's physical YubiKey/hardware authenticator.

Your mission is to perform a web security assessment against the live portal, systematically analyze the authentication state machine, exploit a server-side parser and state inconsistency flaw, bypass the 2-step verification, and access the protected server-side resource to retrieve the classified flag.

---

## 🏛️ Authentication State Machine Specification

The authentication service models four explicit states:

```
[ ANONYMOUS ]
      │
      │  POST /api/v1/auth/login (valid credentials)
      ▼
[ PASSWORD_VERIFIED ] ──(session.otp is null)
      │
      ├──► POST /api/v1/mfa/send-otp ──► [ MFA_PENDING ] (session.otp is "849102")
      │                                       │
      │                                       │  POST /api/v1/mfa/verify (valid 6-digit code)
      │                                       ▼
      │                                [ AUTHENTICATED ]
      │                                       ▲
      │                                       │
      └──► POST /api/v1/mfa/verify ───────────┘
           (EXPLOIT PATH: Altered Content-Type / empty body causes
            submittedOtp to be null. Server evaluates null == null,
            inconsistently transitioning PASSWORD_VERIFIED directly to AUTHENTICATED!)
```

### Security Invariant
> **Administrative Security Invariant**: Access to protected administrative resources (`/admin/console` and `GET /api/v1/admin/classified-data`) strictly requires `auth_state === 'AUTHENTICATED'`. Any request in `ANONYMOUS`, `PASSWORD_VERIFIED`, or `MFA_PENDING` returns `403 Forbidden`.

---

## 🔍 Discoverability & System Analysis

Players can systematically map the authentication flow using:

1. **Session Diagnostic API**:
   ```http
   GET /api/v1/auth/session
   ```
   Returns the current active state (`auth_state`), user identity, and MFA dispatch status.

2. **Diagnostic Headers**:
   Every HTTP response includes the `X-Auth-State` header indicating the active state (`ANONYMOUS`, `PASSWORD_VERIFIED`, `MFA_PENDING`, or `AUTHENTICATED`).

3. **Access Control Boundaries**:
   Attempting to access `GET /api/v1/admin/classified-data` before completing MFA reveals the expected transition requirement:
   ```json
   {
     "error": "Access Denied: Administrative access strictly requires AUTHENTICATED state.",
     "required_state": "AUTHENTICATED",
     "current_state": "PASSWORD_VERIFIED"
   }
   ```

4. **Protected Flag Objective**:
   The flag is stored behind the protected server-side resource `GET /api/v1/admin/classified-data`, accessible only when the session reaches `AUTHENTICATED`.

---

## 🛰️ API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Web User Interface |
| `GET` | `/api/v1/auth/session` | Inspect current authentication state |
| `POST` | `/api/v1/auth/login` | Primary credential authentication (`ANONYMOUS` → `PASSWORD_VERIFIED`) |
| `POST` | `/api/v1/mfa/send-otp` | Dispatches 6-digit OTP code (`PASSWORD_VERIFIED` → `MFA_PENDING`, 30s cooldown) |
| `POST` | `/api/v1/mfa/verify` | Second factor validation (Vulnerable logic checkpoint) |
| `GET` | `/api/v1/admin/classified-data` | Protected server-side resource (Returns flag if `AUTHENTICATED`) |
| `POST` | `/api/v1/auth/logout` | Terminates active session (`→ ANONYMOUS`) |
