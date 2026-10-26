/**
 * Challenge: Apex IAM - Enterprise Multi-Factor Authentication Gateway
 * Reference: BePracticalTech - "Here's How Weak Backend Code Leads to MFA Bypass | Practical Demonstration"
 * Flag: flag{nUlL_c0mp4r1s0n_mf4_byp4ss_78a4}
 * 
 * Authentication State Machine:
 *   ANONYMOUS -> (valid login) -> PASSWORD_VERIFIED -> (send-otp) -> MFA_PENDING -> (verify) -> AUTHENTICATED
 * 
 * Security Invariant:
 *   Administrative resources require auth_state === 'AUTHENTICATED'.
 */

const http = require('node:http');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 4000;
const FLAG = process.env.FLAG || "flag{nUlL_c0mp4r1s0n_mf4_byp4ss_78a4}";

// Configured outside the HTML markup
const TARGET_USER = "admin@apexvault.corp";
const TARGET_PASS = "Winter2026@Access!";

// In-memory active authentication sessions
// Format: token -> { id, username, name, role, state, otp, lastOtpSentAt, createdAt }
const sessions = {};

// Parse cookies from request
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

// Get session from Cookie or Authorization header
function getSession(req) {
  const cookies = parseCookies(req);
  let token = cookies['apex_session'];
  if (!token && req.headers['authorization']) {
    token = req.headers['authorization'].replace(/^Bearer\s+/i, '').trim();
  }
  return token && sessions[token] ? sessions[token] : null;
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': reqOrigin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    ...extraHeaders
  });
  res.end(JSON.stringify(data, null, 2));
}

let reqOrigin = '*';

const server = http.createServer((req, res) => {
  reqOrigin = req.headers.origin || '*';

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': reqOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const session = getSession(req);

  // Set diagnostic state header for systematic analysis
  if (session) {
    res.setHeader('X-Auth-State', session.state);
  } else {
    res.setHeader('X-Auth-State', 'ANONYMOUS');
  }

  // --- GET / or /login : Main SPA Interface ---
  if (req.method === 'GET' && (pathname === '/' || pathname === '/login' || pathname === '/admin/console')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apex IAM | Enterprise Single Sign-On Gateway</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(17, 24, 39, 0.95);
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --text-main: #f9fafb;
      --text-muted: #94a3b8;
      --border: #1e293b;
      --error: #ef4444;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.12) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.08) 0px, transparent 50%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 2.5rem 0 1.5rem 0;
    }
    .brand-icon {
      width: 42px;
      height: 42px;
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
      box-shadow: 0 0 20px rgba(37, 99, 235, 0.4);
    }
    .brand-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.5px; }
    .brand-tag { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
    .auth-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      width: 100%;
      max-width: 460px;
      padding: 2.25rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.05);
      position: relative;
    }
    .card-header { margin-bottom: 1.5rem; }
    .card-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.4rem; }
    .card-subtitle { font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; }
    .state-indicator {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #030712;
      border: 1px solid var(--border);
      padding: 0.5rem 0.85rem;
      border-radius: 8px;
      font-size: 0.75rem;
      margin-bottom: 1.5rem;
      font-family: 'JetBrains Mono', monospace;
    }
    .state-pill {
      background: rgba(37, 99, 235, 0.2);
      color: #93c5fd;
      border: 1px solid rgba(37, 99, 235, 0.4);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .form-group { margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.825rem; font-weight: 500; color: #cbd5e1; margin-bottom: 0.5rem; }
    input {
      width: 100%;
      background: #030712;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      color: #f3f4f6;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25); }
    .btn {
      width: 100%;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.85rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; }
    .btn-secondary {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border);
      margin-top: 0.75rem;
    }
    .btn-secondary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.05); color: #fff; }
    .banner {
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
      display: none;
    }
    .banner-error { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; }
    .banner-info { background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(37, 99, 235, 0.35); color: #93c5fd; }
    .banner-success { background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); color: #6ee7b7; }
    
    /* Console View */
    .console-container { width: 100%; max-width: 900px; display: none; }
    .flag-banner {
      background: linear-gradient(135deg, rgba(37,99,235,0.2), rgba(16,185,129,0.2));
      border: 1px solid #2563eb;
      border-radius: 12px;
      padding: 1.75rem;
      margin-bottom: 2rem;
      box-shadow: 0 0 30px rgba(37,99,235,0.25);
    }
    .flag-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.35rem;
      color: #34d399;
      background: #030712;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      border: 1px solid #1e293b;
      margin-top: 0.75rem;
      display: inline-block;
      font-weight: 600;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; }
    .info-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
    .footer { margin-top: auto; padding: 2rem 0; text-align: center; font-size: 0.75rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="brand">
    <div class="brand-icon">▲</div>
    <div>
      <div class="brand-title">Apex IAM</div>
      <div class="brand-tag">Enterprise Zero Trust Gateway</div>
    </div>
  </div>

  <!-- Auth Card -->
  <div class="auth-card" id="authCard">
    <div id="banner" class="banner"></div>

    <div class="state-indicator">
      <span style="color:#94a3b8;">Auth State Machine:</span>
      <span class="state-pill" id="authStateDisplay">ANONYMOUS</span>
    </div>

    <!-- Step 1: Login Form (Fields intentionally start blank without hardcoded values) -->
    <div id="step-login">
      <div class="card-header">
        <h2 class="card-title">Sign in to your account</h2>
        <p class="card-subtitle">Enter your employee identity credentials to begin verification.</p>
      </div>
      <form id="loginForm" onsubmit="handleLogin(event)">
        <div class="form-group">
          <label>Employee Email / UPN</label>
          <input type="email" id="username" placeholder="name@company.corp" autocomplete="username" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="password" placeholder="••••••••••••" autocomplete="current-password" required />
        </div>
        <button type="submit" class="btn" id="loginBtn">Authenticate Identity</button>
      </form>
    </div>

    <!-- Step 2: MFA Screen (Hidden initially, shown only when state demands it) -->
    <div id="step-mfa" style="display:none;">
      <div class="card-header">
        <h2 class="card-title">Two-Step Verification</h2>
        <p class="card-subtitle">A second authentication factor is required before administrative privilege is granted.</p>
      </div>
      <form id="mfaForm" onsubmit="handleMfa(event)">
        <div class="form-group">
          <label>6-Digit Verification Code</label>
          <input 
            type="text" 
            id="otpCode" 
            placeholder="000000" 
            maxlength="6" 
            pattern="[0-9]{6}" 
            autocomplete="one-time-code" 
            style="letter-spacing: 6px; font-size: 1.25rem; text-align: center; font-weight: 600;" 
            required 
          />
        </div>
        <button type="submit" class="btn" id="verifyBtn">Verify Code</button>
        <button type="button" class="btn btn-secondary" id="resendBtn" onclick="sendOtp()">Dispatch Code to Hardware Device</button>
        <button type="button" class="btn btn-secondary" onclick="logout()" style="border-color:#ef4444; color:#fca5a5;">Cancel / Sign Out</button>
      </form>
    </div>
  </div>

  <!-- Protected Admin Console (Shown only when AUTHENTICATED) -->
  <div class="console-container" id="consoleView">
    <div class="flag-banner">
      <div style="font-size:0.85rem; text-transform:uppercase; color:#93c5fd; letter-spacing:1px; font-weight:600;">
        🎯 Top Secret Clearance Granted — Server-Side Flag
      </div>
      <div class="flag-code" id="flagDisplay">Loading authorized flag...</div>
      <p style="margin-top:0.85rem; font-size:0.85rem; color:#cbd5e1;">
        Retrieved directly from protected server-side resource <code>/api/v1/admin/classified-data</code>.
      </p>
    </div>

    <div class="grid">
      <div class="info-card">
        <h3 style="font-size:1.05rem; margin-bottom:0.75rem; color:#e2e8f0;">Security State Machine</h3>
        <p style="font-size:0.85rem; color:#94a3b8; margin-bottom:0.4rem;">Status: <strong style="color:#34d399;">AUTHENTICATED</strong></p>
        <p style="font-size:0.85rem; color:#94a3b8; margin-bottom:0.4rem;">Operator: <strong id="adminNameDisplay" style="color:#f3f4f6;">Alex Morgan</strong></p>
        <p style="font-size:0.85rem; color:#94a3b8;">Clearance: <strong style="color:#38bdf8;">Level 5 Executive</strong></p>
      </div>
      <div class="info-card">
        <h3 style="font-size:1.05rem; margin-bottom:0.75rem; color:#e2e8f0;">Session Controls</h3>
        <button class="btn btn-secondary" onclick="logout()" style="width:100%; border-color:#ef4444; color:#fca5a5;">
          Terminate Executive Session
        </button>
      </div>
    </div>
  </div>

  <div class="footer">
    Apex Security Cloud • Protected by Hardware MFA & Zero Trust Policy Engine v4.3.0
  </div>

  <script>
    let cooldownTimer = null;

    function showBanner(type, message) {
      const b = document.getElementById('banner');
      b.className = 'banner banner-' + type;
      b.textContent = message;
      b.style.display = 'block';
    }
    function hideBanner() {
      document.getElementById('banner').style.display = 'none';
    }

    function updateStateUI(state) {
      document.getElementById('authStateDisplay').textContent = state;
      const card = document.getElementById('authCard');
      const stepLogin = document.getElementById('step-login');
      const stepMfa = document.getElementById('step-mfa');
      const consoleView = document.getElementById('consoleView');

      if (state === 'AUTHENTICATED') {
        card.style.display = 'none';
        consoleView.style.display = 'block';
        fetchClassifiedFlag();
      } else if (state === 'PASSWORD_VERIFIED' || state === 'MFA_PENDING') {
        card.style.display = 'block';
        stepLogin.style.display = 'none';
        stepMfa.style.display = 'block';
        consoleView.style.display = 'none';
      } else {
        card.style.display = 'block';
        stepLogin.style.display = 'block';
        stepMfa.style.display = 'none';
        consoleView.style.display = 'none';
      }
    }

    // Step 2 & Frontend Fix: Server-validated session resumption on page refresh
    async function checkSession() {
      try {
        const res = await fetch('/api/v1/auth/session', { credentials: 'include' });
        const data = await res.json();
        updateStateUI(data.state || 'ANONYMOUS');
        if (data.mfa && data.mfa.cooldown_seconds_remaining > 0) {
          startCooldown(data.mfa.cooldown_seconds_remaining);
        }
      } catch (e) {
        updateStateUI('ANONYMOUS');
      }
    }

    async function handleLogin(e) {
      e.preventDefault();
      hideBanner();
      const u = document.getElementById('username').value.trim();
      const p = document.getElementById('password').value;
      const btn = document.getElementById('loginBtn');
      btn.disabled = true;
      btn.textContent = 'Verifying credentials...';

      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();

        if (res.ok) {
          showBanner('info', data.message || 'Primary credentials accepted. 2FA required.');
          updateStateUI(data.auth_state);
        } else {
          showBanner('error', data.error || 'Authentication rejected.');
        }
      } catch (err) {
        showBanner('error', 'Network error connecting to authentication server.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Authenticate Identity';
      }
    }

    async function handleMfa(e) {
      e.preventDefault();
      hideBanner();
      const code = document.getElementById('otpCode').value.trim();
      const btn = document.getElementById('verifyBtn');
      btn.disabled = true;
      btn.textContent = 'Validating code...';

      try {
        const res = await fetch('/api/v1/mfa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ otp: code })
        });
        const data = await res.json();

        if (res.ok && data.auth_state === 'AUTHENTICATED') {
          showBanner('success', 'Authentication verified! Entering Executive Console...');
          setTimeout(() => {
            updateStateUI('AUTHENTICATED');
          }, 600);
        } else {
          showBanner('error', data.error || 'Verification failed. Incorrect OTP.');
        }
      } catch (err) {
        showBanner('error', 'Error communicating with MFA gateway.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify Code';
      }
    }

    function startCooldown(seconds) {
      const btn = document.getElementById('resendBtn');
      let remaining = seconds;
      btn.disabled = true;
      btn.textContent = \`Dispatch Code (\${remaining}s)\`;

      if (cooldownTimer) clearInterval(cooldownTimer);
      cooldownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(cooldownTimer);
          btn.disabled = false;
          btn.textContent = 'Dispatch Code to Hardware Device';
        } else {
          btn.textContent = \`Dispatch Code (\${remaining}s)\`;
        }
      }, 1000);
    }

    async function sendOtp() {
      hideBanner();
      try {
        const res = await fetch('/api/v1/mfa/send-otp', {
          method: 'POST',
          credentials: 'include'
        });
        const data = await res.json();

        if (res.status === 429) {
          showBanner('error', data.error);
          if (data.retry_after_seconds) startCooldown(data.retry_after_seconds);
          return;
        }

        if (res.ok) {
          showBanner('info', data.message || 'OTP dispatched to hardware device.');
          updateStateUI(data.auth_state);
          startCooldown(data.cooldown_seconds || 30);
        } else {
          showBanner('error', data.error || 'Failed to dispatch OTP.');
        }
      } catch (err) {
        showBanner('error', 'Error dispatching OTP.');
      }
    }

    // Step 4 & Frontend Fix: Retrieve flag strictly from authorized server-side resource
    async function fetchClassifiedFlag() {
      try {
        const res = await fetch('/api/v1/admin/classified-data', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('flagDisplay').textContent = data.classified_flag;
          if (data.authorized_operator) {
            document.getElementById('adminNameDisplay').textContent = data.authorized_operator;
          }
        } else {
          const err = await res.json();
          document.getElementById('flagDisplay').textContent = 'Error: ' + (err.error || 'Unauthorized');
          document.getElementById('flagDisplay').style.color = '#ef4444';
        }
      } catch (e) {
        document.getElementById('flagDisplay').textContent = 'Failed to load protected resource.';
      }
    }

    async function logout() {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      document.getElementById('otpCode').value = '';
      hideBanner();
      updateStateUI('ANONYMOUS');
    }

    // Initialize session state on page load
    window.addEventListener('DOMContentLoaded', checkSession);
  </script>
</body>
</html>`);
  }

  // --- API Endpoint: GET /api/v1/auth/session (Discoverable Session State) ---
  if (req.method === 'GET' && pathname === '/api/v1/auth/session') {
    if (!session) {
      return sendJson(res, 200, {
        state: 'ANONYMOUS',
        authenticated: false,
        message: 'No active session. Please authenticate primary credentials.'
      });
    }

    const now = Date.now();
    const cooldownRemaining = session.lastOtpSentAt ? Math.max(0, Math.ceil((30000 - (now - session.lastOtpSentAt)) / 1000)) : 0;

    return sendJson(res, 200, {
      state: session.state,
      authenticated: session.state === 'AUTHENTICATED',
      user: {
        username: session.username,
        name: session.name,
        role: session.role
      },
      mfa: {
        required: true,
        otp_dispatched: session.state === 'MFA_PENDING',
        cooldown_seconds_remaining: cooldownRemaining
      }
    });
  }

  // --- Collect Request Body ---
  let bodyBuffer = '';
  req.on('data', chunk => { bodyBuffer += chunk; });

  req.on('end', () => {
    const contentType = req.headers['content-type'] || '';
    let parsedBody = null;

    // Server-side parsing behavior central to the challenge:
    // Only parses JSON if Content-Type matches application/json and body is present.
    // If Content-Type is altered, omitted, or body is empty, parsedBody remains null.
    if (contentType.toLowerCase().includes('application/json') && bodyBuffer.trim().length > 0) {
      try {
        parsedBody = JSON.parse(bodyBuffer);
      } catch (e) {
        return sendJson(res, 400, {
          error: "Malformed JSON payload.",
          auth_state: session ? session.state : 'ANONYMOUS'
        });
      }
    }

    // --- API Endpoint: POST /api/v1/auth/login ---
    if (req.method === 'POST' && pathname === '/api/v1/auth/login') {
      const username = parsedBody?.username;
      const password = parsedBody?.password;

      if (!username || !password) {
        return sendJson(res, 400, { error: "Username and password are required." });
      }

      if (username === TARGET_USER && password === TARGET_PASS) {
        const sessionId = "apex_sess_" + crypto.randomBytes(16).toString('hex');

        // State Machine Transition: ANONYMOUS -> PASSWORD_VERIFIED
        // session.otp is null (not yet dispatched!)
        sessions[sessionId] = {
          id: sessionId,
          username: TARGET_USER,
          name: "Alex Morgan",
          role: "admin",
          state: "PASSWORD_VERIFIED",
          otp: null,
          lastOtpSentAt: 0,
          createdAt: Date.now()
        };

        // Set secure session cookie (no token in redirect URL)
        const cookieHeader = `apex_session=${sessionId}; Path=/; SameSite=Lax; HttpOnly`;
        return sendJson(res, 200, {
          status: "mfa_required",
          auth_state: "PASSWORD_VERIFIED",
          message: "Primary credentials accepted. Second factor required.",
          session_token: sessionId
        }, { 'Set-Cookie': cookieHeader });
      }

      return sendJson(res, 401, { error: "Invalid credentials provided." });
    }

    // --- API Endpoint: POST /api/v1/mfa/send-otp ---
    if (req.method === 'POST' && pathname === '/api/v1/mfa/send-otp') {
      if (!session) {
        return sendJson(res, 401, { error: "Authentication session required.", auth_state: "ANONYMOUS" });
      }

      if (session.state === 'AUTHENTICATED') {
        return sendJson(res, 400, { error: "Session is already fully authenticated.", auth_state: session.state });
      }

      // Server-side rate limit & cooldown enforcement
      const now = Date.now();
      const elapsed = now - session.lastOtpSentAt;
      if (elapsed < 30000) {
        const retryAfter = Math.ceil((30000 - elapsed) / 1000);
        return sendJson(res, 429, {
          error: "Rate limit exceeded. Please wait before requesting another OTP.",
          retry_after_seconds: retryAfter,
          auth_state: session.state
        }, { 'Retry-After': String(retryAfter) });
      }

      // State Machine Transition: PASSWORD_VERIFIED -> MFA_PENDING
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      session.state = "MFA_PENDING";
      session.otp = generatedOtp;
      session.lastOtpSentAt = now;

      return sendJson(res, 200, {
        status: "otp_dispatched",
        auth_state: "MFA_PENDING",
        message: "A 6-digit verification code has been dispatched to Alex Morgan's hardware token.",
        cooldown_seconds: 30
      });
    }

    // --- API Endpoint: POST /api/v1/mfa/verify (THE CONTROLLED VULNERABLE ENDPOINT) ---
    if (req.method === 'POST' && pathname === '/api/v1/mfa/verify') {
      if (!session) {
        return sendJson(res, 401, { error: "Authentication session required.", auth_state: "ANONYMOUS" });
      }

      if (session.state === 'AUTHENTICATED') {
        return sendJson(res, 200, {
          status: "already_authenticated",
          auth_state: "AUTHENTICATED",
          message: "Session is already fully authenticated."
        });
      }

      // =========================================================================
      // INTENDED STATE MACHINE INCONSISTENCY (BePracticalTech Flaw):
      //
      // Intended Security Invariant:
      //   Transition to AUTHENTICATED should strictly require:
      //     1. Current state must be MFA_PENDING
      //     2. session.otp must be a valid, active string
      //     3. submittedOtp must strictly equal session.otp
      //
      // The Deliberate Logic Flaw:
      //   1. If Content-Type is altered/omitted or body is empty, parsedBody is null.
      //      submittedOtp evaluates to null (or undefined).
      //   2. In PASSWORD_VERIFIED state (before /send-otp), session.otp is null.
      //   3. The developer performed a loose check without enforcing state:
      //        submittedOtp == expectedOtp
      //      When both evaluate to null, null == null evaluates to TRUE!
      //   4. This invalidly transitions PASSWORD_VERIFIED directly to AUTHENTICATED,
      //      completely skipping MFA_PENDING!
      // =========================================================================

      const submittedOtp = parsedBody ? parsedBody.otp : null;
      const expectedOtp = session.otp; // null if state is PASSWORD_VERIFIED!

      // Normal path validation: if JSON body supplied an OTP, validate 6-digit format
      if (parsedBody && parsedBody.otp !== undefined && typeof parsedBody.otp === 'string') {
        if (!/^[0-9]{6}$/.test(parsedBody.otp)) {
          return sendJson(res, 400, {
            error: "Invalid OTP format. Must be a 6-digit numerical code.",
            auth_state: session.state
          });
        }
      }

      if (submittedOtp == expectedOtp) {
        session.state = "AUTHENTICATED";
        session.otp = null; // consume OTP
        return sendJson(res, 200, {
          status: "success",
          auth_state: "AUTHENTICATED",
          message: "Two-step verification completed successfully."
        });
      }

      return sendJson(res, 403, {
        error: "Verification failed. Submitted code does not match active OTP.",
        auth_state: session.state
      });
    }

    // --- API Endpoint: GET /api/v1/admin/classified-data (PROTECTED RESOURCE) ---
    if (req.method === 'GET' && pathname === '/api/v1/admin/classified-data') {
      // Step 4: Strict enforcement of security invariant
      if (!session || session.state !== 'AUTHENTICATED') {
        return sendJson(res, 403, {
          error: "Access Denied: Administrative access strictly requires AUTHENTICATED state.",
          required_state: "AUTHENTICATED",
          current_state: session ? session.state : "ANONYMOUS"
        });
      }

      // Return the confidential flag only from this authorized server-side resource
      return sendJson(res, 200, {
        classification: "TOP SECRET // LEVEL 5 ACCESS",
        system_status: "NOMINAL",
        authorized_operator: session.name,
        classified_flag: FLAG
      });
    }

    // --- API Endpoint: POST /api/v1/auth/logout ---
    if (req.method === 'POST' && pathname === '/api/v1/auth/logout') {
      if (session) {
        delete sessions[session.id];
      }
      return sendJson(res, 200, {
        status: "logged_out",
        auth_state: "ANONYMOUS",
        message: "Session terminated successfully."
      }, {
        'Set-Cookie': 'apex_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      });
    }

    return sendJson(res, 404, { error: "Resource not found." });
  });
});

server.listen(PORT, () => {
  console.log(`[+] Apex IAM Live Target Portal running on http://localhost:${PORT}`);
  console.log(`[+] Security Invariant: Access to /api/v1/admin/classified-data requires AUTHENTICATED`);
  console.log(`[+] Flag: ${FLAG}`);
});
