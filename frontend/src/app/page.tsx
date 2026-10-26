"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "./apiConfig";

export default function Home() {
  const [username, setUsername] = useState("");
  const [presentUsers, setPresentUsers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem("token") && localStorage.getItem("role") === "student") {
      router.push("/dashboard");
      return;
    }
    fetchPresentUsers();
  }, []);

  const fetchPresentUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/present`);
      if (res.ok) {
        const data = await res.json();
        setPresentUsers(data.users || []);
      }
    } catch (e) {
      // Backend may still be initializing
    }
  };

  const handleLogin = async (e: React.FormEvent, customUsername?: string) => {
    if (e) e.preventDefault();
    const targetUser = (customUsername || username).trim();
    if (!targetUser) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/student/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUser }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("role", data.role);
        router.push("/dashboard");
      } else {
        const data = await res.json();
        let errorMsg = "Login failed";
        if (typeof data.detail === "string") errorMsg = data.detail;
        else if (Array.isArray(data.detail)) errorMsg = data.detail[0].msg;
        setError(errorMsg);
      }
    } catch (err) {
      setError("Server unreachable");
    } finally {
      setLoading(false);
    }
  };

  const isExistingUser = presentUsers.some(
    (u) => u.toLowerCase() === username.trim().toLowerCase()
  );

  return (
    <div>
      <div className="nav-bar">
        <h2 className="glitch" data-text="The CTF Shuffle">
          The CTF Shuffle<span className="cursor"></span>
        </h2>
        <div className="nav-links">
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/admin">Admin Login</Link>
        </div>
      </div>

      <div className="container" style={{ marginTop: "8vh", maxWidth: "520px" }}>
        <div className="card">
          <h2 style={{ textAlign: "center", marginBottom: "0.5rem" }}>Student Access</h2>
          <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            Enter your alias to join or resume your active CTF session.
          </p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={(e) => handleLogin(e)}>
            <div>
              <label>Your Hacker Alias</label>
              <input
                type="text"
                placeholder="e.g. shadow_byte"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                required
              />
              {username.trim() && (
                <div style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: isExistingUser ? "var(--text-color)" : "var(--text-dim)" }}>
                  {isExistingUser
                    ? "✓ Existing account detected. Re-logging in will restore your progress & points."
                    : "ℹ New alias. Proceeding will create your CTF participant account."}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "1.25rem" }}>
              <button type="submit" disabled={loading} style={{ flex: 1 }}>
                {loading ? "Authenticating..." : isExistingUser ? "Resume Session" : "Join the Contest"}
              </button>
            </div>
          </form>

          {/* Section: Users Already Present */}
          <div style={{ marginTop: "2rem", borderTop: "1px dashed var(--border-color)", paddingTop: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-dim)", fontWeight: "bold" }}>
                Active Participants ({presentUsers.length})
              </span>
              <button
                type="button"
                onClick={fetchPresentUsers}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-dim)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline"
                }}
              >
                Refresh
              </button>
            </div>

            {presentUsers.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontStyle: "italic" }}>
                No participants registered yet. Be the first to join!
              </p>
            ) : (
              <div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.6rem" }}>
                  Logged out? Click your alias below to quickly resume:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", maxHeight: "140px", overflowY: "auto", padding: "0.2rem" }}>
                  {presentUsers.map((u) => {
                    const isSelected = username.trim().toLowerCase() === u.toLowerCase();
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          setUsername(u);
                        }}
                        style={{
                          fontSize: "0.8rem",
                          padding: "0.3rem 0.65rem",
                          borderRadius: "4px",
                          border: isSelected ? "1px solid var(--text-color)" : "1px solid var(--border-color)",
                          background: isSelected ? "rgba(0, 255, 65, 0.25)" : "rgba(0, 255, 65, 0.05)",
                          color: isSelected ? "#fff" : "var(--text-color)",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                        title={`Click to select ${u}`}
                      >
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
