import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.getenv("PORT", "4106"))
OPS_HOSTPORT = os.getenv("OPS_HOSTPORT", "ops-vault:4110")

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/.well-known/webhook-profile":
            return self.reply(200, {"profile": "partner-webhooks-v2", "callback": "/deliveries/current"})
        if self.path == "/deliveries/current":
            self.send_response(302)
            self.send_header("Location", "/deliveries/callback/retry-17")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/deliveries/callback/retry-17":
            self.send_response(302)
            self.send_header("Location", f"http://{OPS_HOSTPORT}/internal/ops/health")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.reply(404, {"error": "not found"})

    def reply(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
