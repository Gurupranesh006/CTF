const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

const db = new DatabaseSync(path.join(__dirname, "ctf.db"));
const targetBase = (process.env.CHALLENGE_BASE_URL || "http://localhost").replace(/\/$/, "");
const targetUrl = (envName, port, route) => {
  const configured = process.env[envName];
  if (configured) return `${configured.replace(/\/$/, "")}${route}`;
  if (process.env.RENDER) throw new Error(`${envName} must be set to the deployed challenge URL on Render`);
  return `${targetBase}:${port}${route}`;
};
const challengeFlag = (envName, localFallback) => {
  const configured = process.env[envName];
  if (configured) return configured;
  if (process.env.RENDER) throw new Error(`${envName} must be configured on Render; refusing a public fallback flag`);
  return localFallback;
};

for (const [name, definition] of [
  ["category", "TEXT NOT NULL DEFAULT 'web'"],
  ["difficulty", "TEXT NOT NULL DEFAULT 'hard'"],
  ["target_url", "TEXT"],
  ["reference_url", "TEXT"],
]) {
  try {
    db.exec(`ALTER TABLE challenge ADD COLUMN ${name} ${definition}`);
  } catch (error) {
    if (!String(error.message).includes("duplicate column")) throw error;
  }
}

const challenges = [
  {
    title: "ProfileSync: Trust Boundary Drift",
    category: "API Security",
    difficulty: "Hard",
    points: 300,
    target_url: targetUrl("PROFILE_URL", 4101, "/api/v2/docs"),
    flag: challengeFlag("PROFILE_FLAG", "flag{mass_assignment_crosses_the_trust_boundary}"),
    description: "Review a profile change request and complete the restricted export workflow.",
  },
  {
    title: "LedgerNorth: Cross-Tenant Invoice",
    category: "API Security",
    difficulty: "Hard",
    points: 325,
    target_url: targetUrl("LEDGER_URL", 4102, "/api/v1/docs"),
    flag: challengeFlag("LEDGER_FLAG", "flag{tenant_isolation_is_an_authorization_check}"),
    description: "Investigate a partner ledger discrepancy and retrieve the associated finance record.",
  },
  {
    title: "HookRelay: Egress Policy Blind Spot",
    category: "Web Security",
    difficulty: "Hard",
    points: 350,
    target_url: targetUrl("HOOKRELAY_URL", 4103, "/api/v1/docs"),
    flag: challengeFlag("HOOKRELAY_FLAG", "flag{redirects_and_dns_are_part_of_ssrf_defense}"),
    description: "Inspect a webhook delivery report and retrieve the incident status.",
  },
  {
    title: "TokenForge: Header Algorithm Confusion",
    category: "Web Security",
    difficulty: "Hard",
    points: 375,
    target_url: targetUrl("TOKENFORGE_URL", 4104, "/api/v1/docs"),
    flag: challengeFlag("TOKENFORGE_FLAG", "flag{never_trust_the_token_header_for_authorization}"),
    description: "Review a partner sign-in issue and access the protected export.",
  },
  {
    title: "CipherWorks: Signature Key Recovery",
    category: "Cryptography",
    difficulty: "Very Hard",
    points: 500,
    target_url: targetUrl("CIPHERWORKS_URL", 4105, "/api/v1/crypto/brief"),
    flag: challengeFlag("CIPHERWORKS_FLAG", "flag{ecdsa_nonce_reuse_breaks_signing_keys}"),
    description: "Audit the incident signing records and complete the pending approval.",
  },
];

// Rename the previous RSA version of the fifth challenge in place. If a newer
// row already exists, carry its submissions onto the legacy row before removal.
const legacyCrypto = db.prepare("SELECT id FROM challenge WHERE title = ?").get("CipherWorks: Common Modulus Incident");
const currentCrypto = db.prepare("SELECT id FROM challenge WHERE title = ?").get("CipherWorks: Signature Key Recovery");
if (legacyCrypto) {
  if (currentCrypto) {
    db.prepare("UPDATE submission SET challenge_id = ? WHERE challenge_id = ?").run(legacyCrypto.id, currentCrypto.id);
    db.prepare("DELETE FROM challenge WHERE id = ?").run(currentCrypto.id);
  }
  db.prepare("UPDATE challenge SET title = ? WHERE id = ?").run("CipherWorks: Signature Key Recovery", legacyCrypto.id);
}

const upsert = db.prepare(`
  INSERT INTO challenge
    (title, description, points, flag, trim_spaces, ignore_case, file_path,
     category, difficulty, target_url, reference_url)
  VALUES (?, ?, ?, ?, 0, 0, NULL, ?, ?, ?, ?)
`);
const findByTitle = db.prepare("SELECT id FROM challenge WHERE title = ?");
const update = db.prepare(`UPDATE challenge SET description=?, points=?, flag=?, category=?,
  difficulty=?, target_url=?, reference_url=? WHERE id=?`);

for (const challenge of challenges) {
  const existing = findByTitle.get(challenge.title);
  const values = [
    challenge.description,
    challenge.points,
    challenge.flag,
    challenge.category,
    challenge.difficulty,
    challenge.target_url,
    challenge.reference_url ?? null,
  ];
  if (existing) {
    update.run(...values, existing.id);
    continue;
  }
  upsert.run(
    challenge.title,
    challenge.description,
    challenge.points,
    challenge.flag,
    challenge.category,
    challenge.difficulty,
    challenge.target_url,
    challenge.reference_url ?? null,
  );
}

console.table(db.prepare("SELECT id, title, category, difficulty, target_url FROM challenge").all());
