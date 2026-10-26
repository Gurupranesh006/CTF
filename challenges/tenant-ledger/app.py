import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.getenv("PORT", "4102"))
FLAG = os.getenv("FLAG") or "flag{tenant_isolation_is_an_authorization_check}"
ENTRIES = {
    "inv-acme-001": {"tenant": "acme", "amount": 4200, "memo": "Q3 renewal", "attachment": "att_7f3a9c2e"},
    "inv-northstar-009": {"tenant": "northstar", "amount": 91000, "memo": "Settlement dispute", "attachment": "att_d1b86e40"},
}
ATTACHMENTS = {
    "att_7f3a9c2e": {"tenant": "acme", "name": "renewal.pdf", "text": "Q3 renewal details"},
    "att_d1b86e40": {"tenant": "northstar", "name": "settlement-review.pdf", "text": "Confidential finance note: " + FLAG},
}


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
            return self.send_json(200, {"service": "LedgerNorth", "docs": "/api/v1/docs"})
        if self.path == "/api/v1/docs":
            return self.send_json(200, {
                "header": "X-Tenant: acme",
                "entries": "GET /api/v1/ledger/entries",
                "entry": "GET /api/v1/ledger/entries/{invoice_id}",
                "activity": "GET /api/v1/activity?cursor=... (change-feed compatibility endpoint)",
                "attachment": "GET /api/v1/attachments/{attachment_id}",
            })
        if self.path == "/api/v1/ledger/entries":
            tenant = self.headers.get("X-Tenant", "")
            rows = [{"id": key, **{k: v for k, v in value.items() if k != "tenant"}}
                    for key, value in ENTRIES.items() if value["tenant"] == tenant]
            return self.send_json(200, {"entries": rows})
        if urlparse(self.path).path == "/api/v1/activity":
            cursor = parse_qs(urlparse(self.path).query).get("cursor", [""])[0]
            if cursor == "first":
                return self.send_json(200, {
                    "events": [{"type": "entry.updated", "tenant": "acme", "object": "inv-acme-001"}],
                    "next_cursor": "delta_8df1",
                })
            if cursor == "delta_8df1":
                # The compatibility feed's continuation cache key loses tenant context.
                return self.send_json(200, {
                    "events": [{"type": "attachment.ready", "tenant": "northstar", "object": "att_d1b86e40"}],
                    "next_cursor": "end",
                })
            return self.send_json(400, {"error": "invalid or expired cursor"})
        if self.path.startswith("/api/v1/attachments/"):
            attachment = ATTACHMENTS.get(self.path.rsplit("/", 1)[-1])
            if not attachment:
                return self.send_json(404, {"error": "attachment not found"})
            return self.send_json(200, {k: v for k, v in attachment.items() if k != "tenant"})
        if self.path.startswith("/api/v1/ledger/entries/"):
            entry = ENTRIES.get(self.path.rsplit("/", 1)[-1])
            if not entry:
                return self.send_json(404, {"error": "entry not found"})
            if entry["tenant"] != self.headers.get("X-Tenant", ""):
                return self.send_json(404, {"error": "entry not found"})
            return self.send_json(200, {k: v for k, v in entry.items() if k != "tenant"})
        return self.send_json(404, {"error": "not found"})


ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
