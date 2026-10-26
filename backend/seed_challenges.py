"""Idempotently seed the live training challenges into the platform database."""

import os
import sqlite3

from database import DB_NAME


TARGET_BASE = os.getenv("CHALLENGE_BASE_URL", "http://localhost").rstrip("/")


def target_url(env_name, local_port, path):
    """Link players to the useful API entry point, not the service banner."""
    configured = os.getenv(env_name)
    if configured:
        base = configured.rstrip("/")
    elif os.getenv("RENDER"):
        raise RuntimeError(f"{env_name} must be set to the deployed challenge service URL on Render")
    else:
        base = f"{TARGET_BASE}:{local_port}"
    return f"{base}{path}"

CHALLENGES = [
    {
        "title": "ProfileSync: Trust Boundary Drift",
        "category": "API Security",
        "difficulty": "Hard",
        "points": 300,
        "target_url": target_url("PROFILE_URL", 4101, "/api/v2/docs"),
        "flag": os.getenv("PROFILE_FLAG") or "flag{mass_assignment_crosses_the_trust_boundary}",
        "description": "Review a profile change request and complete the restricted export workflow.",
    },
    {
        "title": "LedgerNorth: Cross-Tenant Invoice",
        "category": "API Security",
        "difficulty": "Hard",
        "points": 325,
        "target_url": target_url("LEDGER_URL", 4102, "/api/v1/docs"),
        "flag": os.getenv("LEDGER_FLAG") or "flag{tenant_isolation_is_an_authorization_check}",
        "description": "Investigate a partner ledger discrepancy and retrieve the associated finance record.",
    },
    {
        "title": "HookRelay: Egress Policy Blind Spot",
        "category": "Web Security",
        "difficulty": "Hard",
        "points": 350,
        "target_url": target_url("HOOKRELAY_URL", 4103, "/api/v1/docs"),
        "flag": os.getenv("HOOKRELAY_FLAG") or "flag{redirects_and_dns_are_part_of_ssrf_defense}",
        "description": "Inspect a webhook delivery report and retrieve the incident status.",
    },
    {
        "title": "TokenForge: Header Algorithm Confusion",
        "category": "Web Security",
        "difficulty": "Hard",
        "points": 375,
        "target_url": target_url("TOKENFORGE_URL", 4104, "/api/v1/docs"),
        "flag": os.getenv("TOKENFORGE_FLAG") or "flag{never_trust_the_token_header_for_authorization}",
        "description": "Review a partner sign-in issue and access the protected export.",
    },
    {
        "title": "CipherWorks: Signature Key Recovery",
        "category": "Cryptography",
        "difficulty": "Very Hard",
        "points": 500,
        "target_url": target_url("CIPHERWORKS_URL", 4105, "/api/v1/crypto/brief"),
        "flag": os.getenv("CIPHERWORKS_FLAG") or "flag{ecdsa_nonce_reuse_breaks_signing_keys}",
        "description": "Audit the incident signing records and complete the pending approval.",
    },
]


def seed_challenges():
    db = sqlite3.connect(DB_NAME)
    try:
        # Migrate the former RSA crypto challenge without dropping its submissions.
        legacy = db.execute(
            "SELECT id FROM challenge WHERE title = ? ORDER BY id LIMIT 1",
            ("CipherWorks: Common Modulus Incident",),
        ).fetchone()
        current = db.execute(
            "SELECT id FROM challenge WHERE title = ? ORDER BY id LIMIT 1",
            ("CipherWorks: Signature Key Recovery",),
        ).fetchone()
        if legacy:
            if current and current[0] != legacy[0]:
                db.execute("UPDATE submission SET challenge_id = ? WHERE challenge_id = ?", (legacy[0], current[0]))
                db.execute("DELETE FROM challenge WHERE id = ?", (current[0],))
            db.execute("UPDATE challenge SET title = ? WHERE id = ?", ("CipherWorks: Signature Key Recovery", legacy[0]))

        for challenge in CHALLENGES:
            row = db.execute("SELECT id FROM challenge WHERE title = ? ORDER BY id LIMIT 1", (challenge["title"],)).fetchone()
            values = (
                challenge["description"], challenge["points"], challenge["flag"],
                challenge["category"], challenge["difficulty"], challenge["target_url"],
                challenge.get("reference_url"),
            )
            if row:
                db.execute(
                    """UPDATE challenge SET description=?, points=?, flag=?, category=?, difficulty=?,
                       target_url=?, reference_url=? WHERE id=?""",
                    (*values, row[0]),
                )
            else:
                db.execute(
                    """INSERT INTO challenge
                       (title, description, points, flag, trim_spaces, ignore_case, file_path,
                        category, difficulty, target_url, reference_url)
                       VALUES (?, ?, ?, ?, 0, 0, NULL, ?, ?, ?, ?)""",
                    (challenge["title"], challenge["description"], challenge["points"], challenge["flag"],
                     challenge["category"], challenge["difficulty"], challenge["target_url"],
                     challenge.get("reference_url")),
                )
        db.commit()
    finally:
        db.close()
