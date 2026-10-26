"""
Challenge: Nullify - Weak Backend MFA Bypass
Reference: BePracticalTech - "Here's How Weak Backend Code Leads to MFA Bypass | Practical Demonstration"
Flag: flag{nUlL_c0mp4r1s0n_mf4_byp4ss_78a4}
"""

import json
import secrets
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", 4000))
FLAG = os.environ.get("FLAG", "flag{nUlL_c0mp4r1s0n_mf4_byp4ss_78a4}")

TARGET_USER = "admin"
TARGET_PASS = "admin@corp123"

# In-memory sessions: token -> dict
SESSIONS = {}

class MFAChallengeHandler(BaseHTTPRequestHandler):
    def send_json(self, status_code, data):
        body = json.dumps(data, indent=2).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/':
            html = f"""<!DOCTYPE html>
<html>
<head><title>VaultGuard MFA</title></head>
<body style="font-family:monospace;background:#0f172a;color:#22c55e;padding:2rem;">
  <h2>VaultGuard Identity Provider</h2>
  <p>Credentials: <code>{TARGET_USER}</code> / <code>{TARGET_PASS}</code></p>
  <p>Target: Exploit the weak backend verification to bypass MFA and capture the flag.</p>
</body>
</html>""".encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        raw_body = self.rfile.read(content_length).decode('utf-8', errors='ignore') if content_length > 0 else ""
        content_type = self.headers.get('Content-Type', '')

        # Vulnerable parser: Only parses JSON if Content-Type matches
        parsed_body = {}
        if 'application/json' in content_type and raw_body.strip():
            try:
                parsed_body = json.loads(raw_body)
            except Exception:
                return self.send_json(400, {"error": "Malformed JSON"})

        # Endpoint 1: Login
        if parsed.path == '/api/v1/auth/login':
            username = parsed_body.get('username')
            password = parsed_body.get('password')

            if username == TARGET_USER and password == TARGET_PASS:
                token = "mfa_sess_" + secrets.token_hex(16)
                # Session starts with otp = None
                SESSIONS[token] = {
                    "username": TARGET_USER,
                    "role": "admin",
                    "otp": None,
                    "authenticated": False
                }
                return self.send_json(200, {
                    "status": "mfa_required",
                    "mfa_session_token": token,
                    "message": "Credentials verified. MFA required. Check your hardware device for OTP."
                })
            return self.send_json(401, {"error": "Invalid username or password"})

        # Endpoint 2: Send OTP
        if parsed.path == '/api/v1/mfa/send-otp':
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '').strip()
            session = SESSIONS.get(token)
            if not session:
                return self.send_json(401, {"error": "Invalid session token"})
            
            session["otp"] = str(secrets.randbelow(900000) + 100000)
            return self.send_json(200, {"status": "otp_sent", "message": "OTP sent to hardware device."})

        # Endpoint 3: Verify MFA (VULNERABLE)
        if parsed.path == '/api/v1/mfa/verify':
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '').strip()
            session = SESSIONS.get(token)
            if not session:
                return self.send_json(401, {"error": "Invalid session token"})

            # VULNERABILITY:
            # 1. When Content-Type is altered or body is empty, parsed_body is {}
            #    so submitted_otp is None.
            # 2. If client does not trigger /send-otp, session["otp"] is None.
            # 3. None == None evaluates to True!
            submitted_otp = parsed_body.get('otp')
            expected_otp = session.get('otp')

            if submitted_otp == expected_otp:
                session["authenticated"] = True
                return self.send_json(200, {
                    "status": "authenticated",
                    "message": "MFA bypassed successfully via weak backend evaluation (None == None)!",
                    "flag": FLAG
                })

            return self.send_json(403, {"error": "Invalid OTP code provided"})

        self.send_json(404, {"error": "Not found"})

if __name__ == '__main__':
    print(f"[+] Starting Python MFA challenge server on port {PORT}")
    server = HTTPServer(('0.0.0.0', PORT), MFAChallengeHandler)
    server.serve_forever()
