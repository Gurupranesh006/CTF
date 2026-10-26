"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "../../apiConfig";

type Challenge = {
  id: number;
  title: string;
  description: string;
  points: number;
  category: string;
  target_url: string;
  solved?: boolean;
};

type Endpoint = { method: string; path: string; note: string };

const endpointMaps: Record<string, Endpoint[]> = {
  "ProfileSync": [
    { method: "GET", path: "/api/v2/docs", note: "Service reference" },
    { method: "GET", path: "/api/v2/profiles/{id}", note: "Profile record" },
    { method: "PATCH", path: "/api/v2/profiles/{id}", note: "Update profile" },
    { method: "POST", path: "/api/v2/tokens/exchange", note: "Exchange profile context" },
    { method: "GET", path: "/api/v2/admin/export", note: "Restricted export" },
  ],
  "LedgerNorth": [
    { method: "GET", path: "/api/v1/docs", note: "Service reference" },
    { method: "GET", path: "/api/v1/ledger/entries", note: "Tenant ledger" },
    { method: "GET", path: "/api/v1/ledger/entries/{invoice_id}", note: "Invoice record" },
    { method: "GET", path: "/api/v1/activity?cursor=first", note: "Compatibility activity feed" },
    { method: "GET", path: "/api/v1/attachments/{attachment_id}", note: "Invoice attachment" },
  ],
  "HookRelay": [
    { method: "GET", path: "/api/v1/docs", note: "Service reference" },
    { method: "POST", path: "/api/v1/hooks/test", note: "Validate and preview a webhook delivery" },
  ],
  "TokenForge": [
    { method: "GET", path: "/api/v1/docs", note: "Service reference" },
    { method: "POST", path: "/api/v1/auth/login", note: "Partner token flow" },
    { method: "GET", path: "/.well-known/jwks.json", note: "Partner signing keys" },
    { method: "GET", path: "/api/v1/admin/export", note: "Privileged export" },
  ],
  "CipherWorks": [
    { method: "GET", path: "/api/v1/crypto/brief", note: "Curve parameters and audit signatures" },
    { method: "GET", path: "/api/v1/approvals/policy", note: "Approval policy" },
    { method: "POST", path: "/api/v1/approvals/verify", note: "Verify an incident approval" },
  ],
};

export default function ChallengeWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flag, setFlag] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [appOutput, setAppOutput] = useState("");
  const [appBusy, setAppBusy] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [jwtInput, setJwtInput] = useState("");
  const [attachmentId, setAttachmentId] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [signatureR, setSignatureR] = useState("");
  const [signatureS, setSignatureS] = useState("");
  const [manualMethod, setManualMethod] = useState("GET");
  const [manualPath, setManualPath] = useState("/api/v1/docs");
  const [manualHeaders, setManualHeaders] = useState("{}");
  const [manualBody, setManualBody] = useState("{}");
  const [manualOutput, setManualOutput] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [editBeforeSend, setEditBeforeSend] = useState(true);

  const callTarget = async (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => {
    if (!serviceBase) return;
    setAppBusy(true);
    try {
      const response = await fetch(`${serviceBase}${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const raw = await response.text();
      let result: unknown = raw;
      try { result = JSON.parse(raw); } catch { /* Keep non-JSON responses readable. */ }
      const pretty = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      setAppOutput(`${method} ${path}  →  ${response.status}\n\n${pretty}`);
      return result as Record<string, any>;
    } catch (reason) {
      setAppOutput(`Could not reach the challenge service. ${reason instanceof Error ? reason.message : "Check that the local services are running."}`);
    } finally {
      setAppBusy(false);
    }
  };

  const runOrStageRequest = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => {
    if (!editBeforeSend) return callTarget(path, method, body, headers);
    setManualMethod(method);
    setManualPath(path);
    setManualHeaders(JSON.stringify(headers, null, 2));
    setManualBody(body === undefined ? "{}" : JSON.stringify(body, null, 2));
    setManualOutput("Request staged for editing. Review it below, then click Send request.");
    window.setTimeout(() => document.getElementById("manual-request-console")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    return Promise.resolve(undefined);
  };

  const sendManualRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serviceBase) return;
    const path = manualPath.trim();
    if (!path.startsWith("/") || path.startsWith("//")) {
      setManualOutput("Enter a path on this challenge service, beginning with one slash.");
      return;
    }
    setManualBusy(true);
    try {
      const headers = JSON.parse(manualHeaders || "{}") as Record<string, string>;
      const options: RequestInit = { method: manualMethod, headers };
      if (manualMethod !== "GET" && manualMethod !== "HEAD" && manualBody.trim()) {
        options.headers = { "Content-Type": "application/json", ...headers };
        options.body = manualBody;
      }
      const response = await fetch(`${serviceBase}${path}`, options);
      const raw = await response.text();
      let result: unknown = raw;
      try { result = JSON.parse(raw); } catch { /* Preserve plain-text responses. */ }
      const responseObject = result && typeof result === "object" ? result as Record<string, any> : undefined;
      if (responseObject?.access_token) {
        setSessionToken(responseObject.access_token);
        if (challenge?.title.startsWith("TokenForge")) setJwtInput(responseObject.access_token);
      }
      setManualOutput(`${manualMethod} ${path}  →  ${response.status}\n\n${typeof result === "string" ? result : JSON.stringify(result, null, 2)}`);
    } catch (reason) {
      setManualOutput(reason instanceof SyntaxError ? "Headers and body must contain valid JSON." : `Request failed: ${reason instanceof Error ? reason.message : "service unavailable"}`);
    } finally {
      setManualBusy(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || localStorage.getItem("role") !== "student") {
      router.push("/");
      return;
    }
    fetch(`${API_BASE_URL}/api/challenges`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load the active challenge list.");
        const list: Challenge[] = await res.json();
        const found = list.find((item) => item.id === Number(params.id));
        if (!found) throw new Error("This challenge is unavailable. It may have been removed or the contest may have ended.");
        setChallenge(found);
        const appName = Object.keys(endpointMaps).find((name) => found.title.startsWith(name));
        setManualPath(appName ? endpointMaps[appName][0].path : "/");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load challenge."))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  const serviceBase = useMemo(() => {
    if (!challenge?.target_url) return "";
    try { return new URL(challenge.target_url).origin; } catch { return ""; }
  }, [challenge]);

  useEffect(() => {
    if (!challenge?.title.startsWith("HookRelay") || !serviceBase) return;
    fetch(`${serviceBase}/api/v1/docs`)
      .then((res) => res.json())
      .then((data) => {
        const partnerUrl = String(data.preview || "").match(/https?:\/\/[^/\"]+\/\.well-known\/webhook-profile/);
        if (partnerUrl) setHookUrl(partnerUrl[0]);
      })
      .catch(() => setHookUrl(""));
  }, [challenge, serviceBase]);

  const endpoints = useMemo(() => {
    if (!challenge) return [];
    const key = Object.keys(endpointMaps).find((name) => challenge.title.startsWith(name));
    return key ? endpointMaps[key] : [];
  }, [challenge]);

  const submitFlag = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!challenge || !flag.trim()) return;
    setSubmitting(true);
    setFeedback("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/student/challenges/${challenge.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ flag }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Flag submission failed.");
      if (data.is_correct) {
        setFeedback("Flag accepted. Challenge solved.");
        setChallenge({ ...challenge, solved: true });
      } else {
        setFeedback("That flag was not accepted. Check your evidence and try again.");
      }
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Flag submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyBase = async () => {
    if (!serviceBase) return;
    await navigator.clipboard.writeText(serviceBase);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="container" style={{ maxWidth: 1050, paddingTop: "2rem", paddingBottom: "4rem" }}>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <Link href="/dashboard" className="badge badge-inactive">← Challenge board</Link>
        <span className="badge badge-active">LIVE LAB · AUTHORIZED TARGET</span>
      </nav>

      {loading ? <section className="card"><p>Loading challenge workspace…</p></section> : error ? (
        <section className="card"><h1>Challenge unavailable</h1><p>{error}</p><Link href="/dashboard" className="badge badge-active">Return to board</Link></section>
      ) : challenge ? (
        <>
          <header className="card" style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              <span className="badge badge-inactive">{challenge.category}</span>
              <span className="badge badge-active">{challenge.points} pts</span>
            </div>
            <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2.5rem)", marginBottom: "1rem" }}>{challenge.title}</h1>
            <p style={{ maxWidth: 820, fontSize: "1.02rem" }}>{challenge.description}</p>
          </header>

          <section className="card" style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", marginBottom: ".35rem" }}>Live API target</h2>
                <p style={{ color: "var(--text-dim)", overflowWrap: "anywhere" }}>{serviceBase}</p>
              </div>
              <button type="button" onClick={copyBase} style={{ padding: ".55rem 1rem" }}>{copied ? "Copied" : "Copy base URL"}</button>
            </div>
            <p style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: ".9rem" }}>
              This is an API security lab. Use an HTTP client or your browser’s developer tools to inspect and interact with the routes below. The target is isolated for this challenge.
            </p>
          </section>

          <section className="card" style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <span className="badge badge-inactive">BROWSER APP</span>
                <h2 style={{ fontSize: "1.2rem", margin: ".6rem 0 .25rem" }}>
                  {challenge.title.split(":")[0]} workspace
                </h2>
                <p style={{ color: "var(--text-dim)", fontSize: ".9rem" }}>Use the lab’s normal product workflow. The live service remains the source of truth.</p>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: ".55rem", color: "var(--text-color)", fontSize: ".85rem" }}>
                <input type="checkbox" checked={editBeforeSend} onChange={(event) => setEditBeforeSend(event.target.checked)} style={{ width: "auto", margin: 0 }} />
                Edit requests before sending
              </label>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: ".82rem", marginTop: ".75rem" }}>{appBusy ? "Request in progress…" : editBeforeSend ? "App actions will be staged in the request console for review and editing." : "App actions will be sent directly to the service."}</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", marginTop: "1.25rem" }}>
              {challenge.title.startsWith("ProfileSync") && <>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v2/profiles/acme-operator", "GET")}>Load my profile</button>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v2/profiles/acme-operator", "PATCH", { name: "Mira Chen", timezone: "UTC" }, { "X-Profile": "acme-operator" })}>Save profile details</button>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v2/tokens/exchange", "POST", {}, { "X-Profile": "acme-operator" })}>Sign in to export service</button>
                <button type="button" disabled={appBusy || !sessionToken} onClick={() => runOrStageRequest("/api/v2/admin/export", "GET", undefined, { Authorization: `Bearer ${sessionToken}` })}>Request export</button>
              </>}

              {challenge.title.startsWith("LedgerNorth") && <>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v1/ledger/entries", "GET", undefined, { "X-Tenant": "acme" })}>View my ledger</button>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v1/activity?cursor=first")}>Refresh activity</button>
                <input aria-label="Attachment ID" placeholder="Attachment ID" value={attachmentId} onChange={(event) => setAttachmentId(event.target.value)} style={{ flex: "1 1 220px", margin: 0 }} />
                <button type="button" disabled={appBusy || !attachmentId} onClick={() => runOrStageRequest(`/api/v1/attachments/${encodeURIComponent(attachmentId)}`)}>Open attachment</button>
              </>}

              {challenge.title.startsWith("HookRelay") && <>
                <input aria-label="Webhook destination" value={hookUrl} onChange={(event) => setHookUrl(event.target.value)} style={{ flex: "1 1 350px", margin: 0 }} />
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v1/hooks/test", "POST", { url: hookUrl })}>Test webhook</button>
              </>}

              {challenge.title.startsWith("TokenForge") && <>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v1/auth/login", "POST", {})}>Sign in</button>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/.well-known/jwks.json")}>View signing keys</button>
                <textarea aria-label="Bearer token" placeholder="Paste a bearer token to request the export" value={jwtInput} onChange={(event) => setJwtInput(event.target.value)} style={{ flex: "1 1 100%", minHeight: 90, margin: 0 }} />
                <button type="button" disabled={appBusy || !jwtInput} onClick={() => runOrStageRequest("/api/v1/admin/export", "GET", undefined, { Authorization: `Bearer ${jwtInput}` })}>Request privileged export</button>
              </>}

              {challenge.title.startsWith("CipherWorks") && <>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v1/crypto/brief")}>Load audit signatures</button>
                <button type="button" disabled={appBusy} onClick={() => runOrStageRequest("/api/v1/approvals/policy")}>View approval policy</button>
                <input aria-label="Signature r" placeholder="Signature r (hex)" value={signatureR} onChange={(event) => setSignatureR(event.target.value)} style={{ flex: "1 1 220px", margin: 0 }} />
                <input aria-label="Signature s" placeholder="Signature s (hex)" value={signatureS} onChange={(event) => setSignatureS(event.target.value)} style={{ flex: "1 1 220px", margin: 0 }} />
                <button type="button" disabled={appBusy || !signatureR || !signatureS} onClick={() => runOrStageRequest("/api/v1/approvals/verify", "POST", { message: "approve:incident-9001:scope=admin", r: signatureR, s: signatureS })}>Verify approval</button>
              </>}
            </div>
            {appOutput && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 360, overflow: "auto", marginTop: "1.25rem", padding: "1rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "rgba(0,0,0,.65)", color: "var(--text-color)", fontSize: ".85rem" }}>{appOutput}</pre>}
          </section>

          <section id="manual-request-console" className="card" style={{ marginBottom: "1.25rem" }}>
            <span className="badge badge-inactive">MANUAL TESTING</span>
            <h2 style={{ fontSize: "1.2rem", margin: ".6rem 0 .25rem" }}>Request console</h2>
            <p style={{ color: "var(--text-dim)", fontSize: ".9rem", marginBottom: "1.1rem" }}>Send a request directly to this challenge’s API. Enter a path, optional JSON headers, and a JSON body.</p>
            <p style={{ color: "var(--text-dim)", fontSize: ".9rem", marginBottom: "1.1rem", padding: ".75rem 1rem", borderLeft: "3px solid var(--text-color)", background: "rgba(0,255,65,.06)" }}>
              <strong style={{ color: "var(--text-color)" }}>Recommended tool:</strong> Burp Suite is preferred for realistic request inspection, editing, and replay. Use this web console for quick checks when Burp Suite is unavailable.
            </p>
            <form onSubmit={sendManualRequest} style={{ display: "grid", gap: ".75rem" }}>
              <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
                <select aria-label="HTTP method" value={manualMethod} onChange={(event) => setManualMethod(event.target.value)} style={{ width: 150, margin: 0 }}>
                  {["GET", "POST", "PATCH"].map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
                <input aria-label="Request path" value={manualPath} onChange={(event) => setManualPath(event.target.value)} placeholder="/api/v1/resource" style={{ flex: "1 1 280px", margin: 0 }} />
              </div>
              <textarea aria-label="Request headers JSON" value={manualHeaders} onChange={(event) => setManualHeaders(event.target.value)} placeholder={'{"X-Tenant":"acme"}'} style={{ minHeight: 76, margin: 0 }} />
              <textarea aria-label="Request body JSON" value={manualBody} onChange={(event) => setManualBody(event.target.value)} placeholder='{"key":"value"}' style={{ minHeight: 100, margin: 0 }} />
              <div><button type="submit" disabled={manualBusy}>{manualBusy ? "Sending…" : "Send request"}</button></div>
            </form>
            {manualOutput && <pre role="status" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 400, overflow: "auto", marginTop: "1rem", padding: "1rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "rgba(0,0,0,.65)", color: "var(--text-color)", fontSize: ".85rem" }}>{manualOutput}</pre>}
          </section>

          <section className="card" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Route map</h2>
            <div style={{ display: "grid", gap: ".55rem" }}>
              {endpoints.map((endpoint) => (
                <div key={`${endpoint.method}-${endpoint.path}`} style={{ display: "grid", gridTemplateColumns: "75px minmax(0, 1fr)", gap: ".75rem", alignItems: "center", padding: ".7rem .8rem", border: "1px solid var(--border-color)", borderRadius: 6, background: "rgba(0,0,0,.35)" }}>
                  <span className="badge badge-active" style={{ textAlign: "center" }}>{endpoint.method}</span>
                  <div style={{ minWidth: 0 }}>
                    <code style={{ overflowWrap: "anywhere", color: "var(--text-color)" }}>{endpoint.path}</code>
                    <div style={{ color: "var(--text-dim)", fontSize: ".82rem" }}>{endpoint.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card" style={{ borderColor: challenge.solved ? "var(--text-color)" : undefined }}>
            {challenge.solved ? <><h2>Challenge solved</h2><p>Your accepted submission is recorded.</p></> : <>
              <h2 style={{ fontSize: "1.1rem" }}>Submit the flag</h2>
              <p style={{ color: "var(--text-dim)", marginBottom: "1rem" }}>Submit the flag you recovered from the live target.</p>
              <form onSubmit={submitFlag} style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
                <input aria-label="Challenge flag" value={flag} onChange={(event) => setFlag(event.target.value)} placeholder="flag{...}" style={{ flex: "1 1 280px", margin: 0 }} />
                <button type="submit" disabled={submitting}>{submitting ? "Checking…" : "Submit flag"}</button>
              </form>
              {feedback && <p role="status" style={{ marginTop: ".85rem", color: feedback.includes("accepted") ? "var(--text-color)" : "var(--error-color)" }}>{feedback}</p>}
            </>}
          </section>
        </>
      ) : null}
    </main>
  );
}
