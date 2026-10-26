import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FLAG = os.getenv("FLAG") or "flag{redirects_and_dns_are_part_of_ssrf_defense}"
PORT = int(os.getenv("PORT", "4110"))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"status": "ok", "component": "operations-vault", "incident_note": FLAG}).encode()
        self.send_response(200 if self.path == "/internal/ops/health" else 404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
