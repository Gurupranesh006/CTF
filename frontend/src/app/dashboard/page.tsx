"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../apiConfig";

export default function Dashboard() {
  const [isActive, setIsActive] = useState(false);
  const [challenges, setChallenges] = useState([]);
  const [flags, setFlags] = useState<{ [key: number]: string }>({});
  const [message, setMessage] = useState<{ [key: number]: { text: string, error: boolean } }>({});
  const [userScore, setUserScore] = useState(0);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (!token || role !== "student") {
      router.push("/");
      return;
    }
    fetchState();
  }, []);

  const fetchState = async () => {
    const res = await fetch(`${API_BASE_URL}/api/contest/state`);
    const data = await res.json();
    setIsActive(data.is_active);
    setEndTime(data.end_time);
    if (data.is_active) {
      fetchChallenges();
      fetchScore();
    }
  };

  useEffect(() => {
    if (!endTime) {
      setTimeLeft("");
      return;
    }
    const interval = setInterval(() => {
      const target = new Date(endTime).getTime();
      const now = new Date().getTime();
      const diff = target - now;
      
      if (diff <= 0) {
        setTimeLeft("00:00:00");
        setIsActive(false);
        clearInterval(interval);
      } else {
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
        const m = Math.floor((diff / 1000 / 60) % 60).toString().padStart(2, '0');
        const s = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
        setTimeLeft(`${h}:${m}:${s}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  const fetchScore = async () => {
    const res = await fetch(`${API_BASE_URL}/api/leaderboard`);
    if (res.ok) {
      const lb = await res.json();
      const username = localStorage.getItem("sub") || jwtDecodeUsername();
      const user = lb.find((u: any) => u.username === username);
      if (user) setUserScore(user.score);
    }
  };

  const jwtDecodeUsername = () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return "";
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub;
    } catch (e) {
      return "";
    }
  };

  const fetchChallenges = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE_URL}/api/challenges`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setChallenges(await res.json());
    } else if (res.status === 403) {
      setIsActive(false);
    }
  };

  const submitFlag = async (challengeId: number) => {
    const token = localStorage.getItem("token");
    const flag = flags[challengeId] || "";
    if (!flag) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/student/challenges/${challengeId}/submit`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ flag })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.is_correct) {
          setMessage({ ...message, [challengeId]: { text: "Correct Flag! +Points", error: false } });
          fetchChallenges();
          fetchScore();
        } else {
          setMessage({ ...message, [challengeId]: { text: "Incorrect flag. Try again.", error: true } });
        }
      } else {
        const data = await res.json();
        let errorMsg = "Error";
        if (data.detail) {
          if (typeof data.detail === "string") errorMsg = data.detail;
          else if (Array.isArray(data.detail)) errorMsg = data.detail[0].msg;
        }
        setMessage({ ...message, [challengeId]: { text: errorMsg, error: true } });
      }
    } catch (err) {
      setMessage({ ...message, [challengeId]: { text: "Server Error", error: true } });
    }
  };

  const logout = () => {
    localStorage.clear();
    router.push("/");
  };

  return (
    <div>
      <div className="nav-bar">
        <h2 className="glitch" data-text="The CTF Shuffle">The CTF Shuffle<span className="cursor"></span></h2>
        <div className="nav-links">
          <Link href="/leaderboard">Leaderboard</Link>
          <button onClick={logout} style={{ padding: "0.4rem 1rem" }}>Logout</button>
        </div>
      </div>

      <div className="container">
        {!isActive ? (
          <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
            <h1 style={{ color: "var(--error-color)" }}>Contest is Inactive</h1>
            <p>Please wait for an admin to start the contest.</p>
          </div>
        ) : (
          <div>
            {timeLeft && (
              <div className={`timer-container ${timeLeft === "00:00:00" ? "timer-danger" : ""}`}>
                <div className="timer-label">Time Remaining</div>
                <div className="timer-display">{timeLeft}</div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>Active Challenges</h2>
              <div className="score-display">SCORE : {userScore}</div>
            </div>
            <div className="grid">
              {challenges.map((c: any) => (
                <div key={c.id} className="card hover-glow" style={c.solved ? { borderColor: "var(--text-color)", boxShadow: "0 0 10px rgba(51,255,51,0.2)" } : {}}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3 style={{ margin: 0 }}>{c.title}</h3>
                    <span className="badge badge-active">{c.points} pts</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                    <span className="badge badge-inactive">{c.category || "Web Security"}</span>
                    {c.target_url && (
                      <Link href={`/challenges/${c.id}`} className="badge badge-active">
                        Enter challenge →
                      </Link>
                    )}
                  </div>
                  <p style={{ marginBottom: "1.5rem" }}>{c.description}</p>
                  
                  {c.file_path && (() => {
                    try {
                      const files = JSON.parse(c.file_path);
                      if (!Array.isArray(files)) throw new Error("not array");
                      return (
                        <div style={{ marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                          {files.map((f: any, i: number) => (
                            <a key={i} href={`${API_BASE_URL}/api/files/${f.stored}`} target="_blank" rel="noreferrer" className="badge badge-active" style={{ padding: "0.5rem", textDecoration: "none", display: "inline-block" }}>
                              ↓ {f.original}
                            </a>
                          ))}
                        </div>
                      );
                    } catch {
                      // Old format: "uploads/filename.png" — strip "uploads/" prefix
                      const rawPath = c.file_path.replace(/^uploads\//, "");
                      return (
                        <div style={{ marginBottom: "1.5rem" }}>
                          <a href={`${API_BASE_URL}/api/files/${rawPath}`} target="_blank" rel="noreferrer" className="badge badge-active" style={{ padding: "0.5rem", textDecoration: "none", display: "inline-block" }}>
                            ↓ {rawPath}
                          </a>
                        </div>
                      );
                    }
                  })()}

                  {c.solved ? (
                    <div style={{ color: "var(--text-color)", fontWeight: "bold", textAlign: "center", padding: "1rem", border: "1px solid var(--border-color)", background: "rgba(17,51,17,0.3)" }}>
                      SOLVED
                    </div>
                  ) : (
                    <div>
                      {message[c.id] && (
                        <div style={{ color: message[c.id].error ? "var(--error-color)" : "var(--text-color)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                          {message[c.id].text}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input 
                          type="text" 
                          placeholder="flag{...}" 
                          value={flags[c.id] || ""} 
                          onChange={(e) => setFlags({ ...flags, [c.id]: e.target.value })}
                          style={{ marginBottom: 0 }}
                        />
                        <button onClick={() => submitFlag(c.id)}>Submit</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {challenges.length === 0 && <p>No challenges available yet.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
