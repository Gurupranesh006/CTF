# Comprehensive Solution & Security Analysis: Apex IAM MFA Bypass

## 🎯 Executive Summary
This challenge implements a realistic web authentication vulnerability demonstrated by **BePracticalTech** in the video:  
[**"Here's How Weak Backend Code Leads to MFA Bypass | Practical Demonstration"**](https://youtu.be/ln4dU-KJOQE)

The challenge models a formal 4-state authentication state machine where an input parser differential and uninitialized state allow an unauthorized transition from `PASSWORD_VERIFIED` directly to `AUTHENTICATED`, violating the fundamental security invariant.

---

## 🏛️ Authentication State Machine & Invariant

### States
1. **`ANONYMOUS`**: Unauthenticated client.
2. **`PASSWORD_VERIFIED`**: Primary credentials accepted; `session.otp` is `null`.
3. **`MFA_PENDING`**: 6-digit OTP generated and sent to hardware device; `session.otp` is populated.
4. **`AUTHENTICATED`**: MFA completed; granted Level 5 administrative privileges.

### Security Invariant
```
Administrative Resource (GET /api/v1/admin/classified-data) 
  ==> REQUIRES auth_state === 'AUTHENTICATED'
```

---

## 🔍 Systematic Discoverability

Participants can map the flow without guessing:
1. **State Diagnostics**: `GET /api/v1/auth/session` returns the exact `state` and cooldown timer.
2. **HTTP Headers**: Every response returns `X-Auth-State: <STATE>`.
3. **Access Control Errors**: Requesting `/api/v1/admin/classified-data` before MFA returns:
   ```json
   {
     "error": "Access Denied: Administrative access strictly requires AUTHENTICATED state.",
     "required_state": "AUTHENTICATED",
     "current_state": "PASSWORD_VERIFIED"
   }
   ```

---

## 💥 The Vulnerability (Root Cause)

In [`server.js`](file:///e:/Projects/CTF/challenges/weak-backend-mfa/server.js):
```javascript
// 1. Parser Behavior
if (contentType.toLowerCase().includes('application/json') && bodyBuffer.trim().length > 0) {
  parsedBody = JSON.parse(bodyBuffer);
}

// 2. Unhandled State & Loose Comparison
const submittedOtp = parsedBody ? parsedBody.otp : null;
const expectedOtp = session.otp; // null in PASSWORD_VERIFIED state!

if (submittedOtp == expectedOtp) {
  session.state = "AUTHENTICATED";
  ...
}
```

When an attacker:
1. Logs in with valid credentials → enters `PASSWORD_VERIFIED` (`session.otp` is `null`).
2. Does **not** request an OTP.
3. Sends `POST /api/v1/mfa/verify` with altered `Content-Type: text/plain` and empty body.
4. `parsedBody` is `null` → `submittedOtp` is `null`.
5. Comparison: `null == null` evaluates to `true`!
6. The state transitions to `AUTHENTICATED` without ever verifying a second factor.

---

## 🛡️ Remediation (Defensive Fix)

```javascript
// SECURE VERIFICATION LOGIC
app.post('/api/v1/mfa/verify', (req, res) => {
  // 1. Enforce strict state machine requirement
  if (session.state !== 'MFA_PENDING') {
    return res.status(400).json({ error: "Session is not awaiting second-factor verification." });
  }

  // 2. Enforce strict Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }

  // 3. Strict presence and validation of session OTP
  if (!session.otp || typeof session.otp !== 'string' || session.otp.length !== 6) {
    return res.status(400).json({ error: "No valid active OTP found." });
  }

  // 4. Strict input format validation
  const submittedOtp = req.body?.otp;
  if (!submittedOtp || typeof submittedOtp !== 'string' || !/^[0-9]{6}$/.test(submittedOtp)) {
    return res.status(400).json({ error: "Invalid OTP format." });
  }

  // 5. Timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(submittedOtp), Buffer.from(session.otp))) {
    return res.status(403).json({ error: "Incorrect OTP code." });
  }

  session.state = 'AUTHENTICATED';
  session.otp = null;
  return res.json({ status: "success", auth_state: "AUTHENTICATED" });
});
```
