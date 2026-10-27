"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "./apiConfig";

export default function Home() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem("token") && localStorage.getItem("role") === "student") {
      router.push("/dashboard");
    }
  }, []);

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
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "1.25rem" }}>
              <button type="submit" disabled={loading} style={{ flex: 1 }}>
                {loading ? "Authenticating..." : "Join / Resume the Contest"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
