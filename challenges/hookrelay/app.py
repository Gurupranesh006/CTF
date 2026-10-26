import json
import os
import urllib.request
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.getenv("PORT", "4103"))
PARTNER_HOSTPORT = os.getenv("PARTNER_HOSTPORT", "hooks.partner.test:4106")
PARTNER_URL = f"http://{PARTNER_HOSTPORT}"


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Profile, X-Tenant")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        return self.send_json(204, {})

    def do_GET(self):
        if self.path == "/":
            return self.send_json(200, {"service": "HookRelay", "docs": "/api/v1/docs"})
        if self.path == "/api/v1/docs":
            return self.send_json(200, {
                "preview": f"POST /api/v1/hooks/test with {{\"url\":\"{PARTNER_URL}/.well-known/webhook-profile\"}}",
                "workflow": "Partner webhook profiles advertise a callback URL; deliveries follow redirects.",
            })
        return self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/v1/hooks/test":
            return self.send_json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            url = json.loads(self.rfile.read(length)).get("url", "")
            parsed = urlparse(url)
            # The webhook destination is checked once when the job is queued.
            # urllib's default redirect handler does not repeat this check.
            partner = urlparse(PARTNER_URL)
            if parsed.scheme != partner.scheme or parsed.hostname != partner.hostname or parsed.port != partner.port:
                return self.send_json(400, {"error": "destination is not an approved partner endpoint"})
            request = urllib.request.Request(url, headers={"User-Agent": "HookRelay/2.1"})
            with urllib.request.urlopen(request, timeout=3) as response:
                body = response.read(4096).decode("utf-8", "replace")
            return self.send_json(200, {"status": response.status, "preview": body})
        except (ValueError, urllib.error.URLError, TimeoutError) as error:
            return self.send_json(502, {"error": "upstream request failed", "detail": str(error)})


ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
