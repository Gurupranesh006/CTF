import base64
import hashlib
import hmac
import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from math import gcd
from urllib.parse import urlparse

PORT = int(os.getenv("PORT", "4104"))
FLAG = os.getenv("FLAG") or "flag{never_trust_the_token_header_for_authorization}"
ISSUER = "https://id.partner.test"
AUDIENCE = "ledger-api"


def probable_prime(number):
    if number % 2 == 0:
        return False
    d, s = number - 1, 0
    while d % 2 == 0:
        s += 1
        d //= 2
    for base in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31):
        x = pow(base, d, number)
        if x in (1, number - 1):
            continue
        for _ in range(s - 1):
            x = pow(x, 2, number)
            if x == number - 1:
                break
        else:
            return False
    return True


def make_prime(bits=512):
    while True:
        value = secrets.randbits(bits) | (1 << (bits - 1)) | 1
        if probable_prime(value):
            return value


e = 65537
p, q = make_prime(), make_prime()
while gcd(e, (p - 1) * (q - 1)) != 1:
    q = make_prime()
n = p * q
d = pow(e, -1, (p - 1) * (q - 1))
JWK = {"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "partner-2026-01",
       "n": base64.urlsafe_b64encode(n.to_bytes((n.bit_length() + 7) // 8, "big")).rstrip(b"=").decode(),
       "e": base64.urlsafe_b64encode(e.to_bytes(3, "big")).rstrip(b"=").decode()}
ENCRYPTION_JWK = {
    "kty": "RSA", "use": "enc", "alg": "RSA-OAEP-256", "kid": "partner-encryption-2026-01",
    "n": base64.urlsafe_b64encode((1 << 511 | 0x6A09E667F3BCC908).to_bytes(64, "big")).rstrip(b"=").decode(),
    "e": base64.urlsafe_b64encode((65537).to_bytes(3, "big")).rstrip(b"=").decode(),
}
JWKS = [ENCRYPTION_JWK, JWK]
KEYS_BY_KID = {key["kid"]: key for key in JWKS}


def decode_part(part):
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


def token(header, claims, signature=""):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=").decode()
    signing = encode(header) + "." + encode(claims)
    if header.get("alg") == "RS256":
        digest_info = bytes.fromhex("3031300d060960864801650304020105000420") + hashlib.sha256(signing.encode()).digest()
        size = (n.bit_length() + 7) // 8
        encoded = b"\x00\x01" + b"\xff" * (size - len(digest_info) - 3) + b"\x00" + digest_info
        signature = base64.urlsafe_b64encode(pow(int.from_bytes(encoded, "big"), d, n).to_bytes(size, "big")).rstrip(b"=").decode()
    return signing + "." + signature


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
        path = urlparse(self.path).path
        if path == "/":
            return self.send_json(200, {"service": "TokenForge", "docs": "/api/v1/docs"})
        if path == "/api/v1/docs":
            return self.send_json(200, {"login": "POST /api/v1/auth/login", "keys": "/.well-known/jwks.json", "issuer": ISSUER, "audience": AUDIENCE, "export": "GET /api/v1/admin/export"})
        if path == "/.well-known/jwks.json":
            return self.send_json(200, {"keys": JWKS})
        if path == "/api/v1/admin/export":
            raw = self.headers.get("Authorization", "").removeprefix("Bearer ").split(".")
            if len(raw) != 3:
                return self.send_json(401, {"error": "bearer token required"})
            try:
                header, claims = decode_part(raw[0]), decode_part(raw[1])
                signing = (raw[0] + "." + raw[1]).encode()
                key_ok = False
                selected_key = KEYS_BY_KID.get(header.get("kid"))
                if selected_key and selected_key.get("use") == "sig" and header.get("alg") == "HS256":
                    # Legacy verifier uses the public JWK bytes as the HMAC secret.
                    hmac_key = json.dumps(selected_key, separators=(",", ":"), sort_keys=True).encode()
                    expected = base64.urlsafe_b64encode(hmac.new(hmac_key, signing, hashlib.sha256).digest()).rstrip(b"=").decode()
                    key_ok = hmac.compare_digest(raw[2], expected)
                elif selected_key and selected_key.get("use") == "sig" and header.get("alg") == "RS256":
                    selected_n = int.from_bytes(base64.urlsafe_b64decode(selected_key["n"] + "=" * (-len(selected_key["n"]) % 4)), "big")
                    selected_e = int.from_bytes(base64.urlsafe_b64decode(selected_key["e"] + "=" * (-len(selected_key["e"]) % 4)), "big")
                    signature = int.from_bytes(base64.urlsafe_b64decode(raw[2] + "=" * (-len(raw[2]) % 4)), "big")
                    recovered = pow(signature, selected_e, selected_n).to_bytes((selected_n.bit_length() + 7) // 8, "big")
                    digest_info = bytes.fromhex("3031300d060960864801650304020105000420") + hashlib.sha256(signing).digest()
                    expected = b"\x00\x01" + b"\xff" * (len(recovered) - len(digest_info) - 3) + b"\x00" + digest_info
                    key_ok = hmac.compare_digest(recovered, expected)
                if (key_ok and claims.get("role") == "admin" and claims.get("iss") == ISSUER
                        and claims.get("aud") == AUDIENCE):
                    return self.send_json(200, {"flag": FLAG})
                return self.send_json(403, {"error": "admin role required"})
            except (ValueError, json.JSONDecodeError):
                return self.send_json(401, {"error": "invalid token"})
        return self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/v1/auth/login":
            return self.send_json(404, {"error": "not found"})
        return self.send_json(200, {"access_token": token({"alg": "RS256", "typ": "JWT", "kid": JWK["kid"]}, {"iss": ISSUER, "aud": AUDIENCE, "sub": "analyst", "role": "analyst"})})


ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
