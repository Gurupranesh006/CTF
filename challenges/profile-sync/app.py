import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.getenv("PORT", "4101"))
FLAG = os.getenv("FLAG") or "flag{mass_assignment_crosses_the_trust_boundary}"
PROFILES = {
    "acme-operator": {"id": "acme-operator", "tenant": "acme", "name": "Mira Chen", "membership": {"role": "operator", "entitlements": ["profile:read"]}},
    "acme-admin": {"id": "acme-admin", "tenant": "acme", "name": "Ari Singh", "membership": {"role": "admin", "entitlements": ["profile:read", "export:restricted"]}},
}
TOKENS = {}


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Profile, X-Tenant")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        return self.reply(204, {})

    def do_GET(self):
        if self.path == "/":
            return self.reply(200, {"service": "ProfileSync", "docs": "/api/v2/docs"})
        if self.path == "/api/v2/docs":
            return self.reply(200, {
                "login": "Use X-Profile: acme-operator",
                "profile": "GET /api/v2/profiles/{id}",
                "update": "PATCH /api/v2/profiles/{id}",
                "exchange": "POST /api/v2/tokens/exchange with X-Profile header",
                "export": "GET /api/v2/admin/export",
            })
        if self.path.startswith("/api/v2/profiles/"):
            profile = PROFILES.get(self.path.rsplit("/", 1)[-1])
            return self.reply(200, profile or {"error": "profile not found"}) if profile else self.reply(404, {"error": "profile not found"})
        if self.path == "/api/v2/admin/export":
            token = self.headers.get("Authorization", "").removeprefix("Bearer ")
            claims = TOKENS.get(token)
            if claims and claims.get("role") == "admin" and "export:restricted" in claims.get("entitlements", []):
                return self.reply(200, {"export": "restricted", "flag": FLAG})
            return self.reply(403, {"error": "restricted export capability required"})
        return self.reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/v2/tokens/exchange":
            return self.reply(404, {"error": "not found"})
        profile = PROFILES.get(self.headers.get("X-Profile", ""))
        if not profile:
            return self.reply(401, {"error": "profile context required"})
        token = secrets.token_urlsafe(24)
        membership = profile["membership"]
        TOKENS[token] = {"sub": profile["id"], "role": membership["role"], "entitlements": list(membership["entitlements"])}
        return self.reply(200, {"access_token": token, "token_type": "Bearer", "expires_in": 300})

    def do_PATCH(self):
        profile_id = self.path.rsplit("/", 1)[-1]
        if profile_id not in PROFILES:
            return self.reply(404, {"error": "profile not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            patch = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            return self.reply(400, {"error": "invalid JSON"})
        if self.headers.get("X-Profile") != profile_id:
            return self.reply(403, {"error": "profile context required"})
        allowed = {"name", "timezone", "membership"}
        profile = PROFILES[profile_id]
        profile.update({key: value for key, value in patch.items() if key in allowed and key != "membership"})
        # The compatibility merge copies membership metadata wholesale. This is the
        # nested mass-assignment flaw: callers can replace authorization attributes.
        if isinstance(patch.get("membership"), dict):
            profile["membership"].update(patch["membership"])
        return self.reply(200, profile)


ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
