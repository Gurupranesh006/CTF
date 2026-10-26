import hashlib
import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

PORT = int(os.getenv("PORT", "4105"))
FLAG = os.getenv("FLAG") or "flag{ecdsa_nonce_reuse_breaks_signing_keys}"
# secp256k1 domain parameters. One per-process nonce is reused for a subset of
# the audit transcript, matching a class of real signing failures.
P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8


def point_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    x1, y1 = a
    x2, y2 = b
    if x1 == x2 and (y1 + y2) % P == 0:
        return None
    slope = ((3 * x1 * x1) * pow(2 * y1, -1, P) if a == b else
             (y2 - y1) * pow((x2 - x1) % P, -1, P)) % P
    x3 = (slope * slope - x1 - x2) % P
    return x3, (slope * (x1 - x3) - y1) % P


def point_mul(k, point=(GX, GY)):
    result = None
    while k:
        if k & 1:
            result = point_add(result, point)
        point = point_add(point, point)
        k >>= 1
    return result


def digest(message):
    return int.from_bytes(hashlib.sha256(message.encode()).digest(), "big")


private_key = secrets.randbelow(N - 1) + 1
reused_nonce = secrets.randbelow(N - 1) + 1
public_key = point_mul(private_key)
records = [
    "approve:batch-041:scope=read",
    "approve:batch-042:scope=read",
    "audit:batch-017:scope=read",
    "approve:batch-043:scope=read",
    "audit:batch-022:scope=read",
]
transcript = []
signature_nonces = [reused_nonce, reused_nonce] + [secrets.randbelow(N - 1) + 1 for _ in records[2:]]
for message, nonce in zip(records, signature_nonces):
    r = point_mul(nonce)[0] % N
    s = (pow(nonce, -1, N) * (digest(message) + r * private_key)) % N
    transcript.append({"message": message, "sha256": f"{digest(message):064x}", "r": f"{r:064x}", "s": f"{s:064x}"})


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Profile, X-Tenant")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            payload = {"service": "CipherWorks", "docs": "/api/v1/crypto/brief"}
        elif path == "/api/v1/crypto/brief":
            payload = {"curve": "secp256k1", "p": f"{P:064x}", "n": f"{N:064x}",
                       "generator": {"x": f"{GX:064x}", "y": f"{GY:064x}"},
                       "public_key": {"x": f"{public_key[0]:064x}", "y": f"{public_key[1]:064x}"},
                       "records": transcript, "workflow": "POST /api/v1/approvals/verify with message, r, s"}
        elif path == "/api/v1/approvals/policy":
            payload = {"required_message": "approve:incident-9001:scope=admin", "signature": "hex r and s fields"}
        else:
            self.send_response(404)
            self.end_headers()
            return
        raw = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Profile, X-Tenant")
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if urlparse(self.path).path != "/api/v1/approvals/verify":
            self.send_response(404)
            self.end_headers()
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            message = body["message"]
            r, s = int(body["r"], 16), int(body["s"], 16)
            if message != "approve:incident-9001:scope=admin" or not (0 < r < N and 0 < s < N):
                raise ValueError("invalid approval")
            w = pow(s, -1, N)
            point = point_add(point_mul((digest(message) * w) % N), point_mul((r * w) % N, public_key))
            if point and point[0] % N == r:
                result = {"approved": True, "incident": "9001", "flag": FLAG}
                status = 200
            else:
                result, status = {"error": "signature rejected"}, 403
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            result, status = {"error": "invalid approval request"}, 400
        raw = json.dumps(result).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Profile, X-Tenant")
        self.end_headers()
        self.wfile.write(raw)


ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
