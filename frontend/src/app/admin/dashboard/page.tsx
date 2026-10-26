"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../../apiConfig";

interface Submission {
  id: number;
  user_id: number;
  challenge_id: number;
  timestamp: string;
  is_correct: boolean;
  submitted_flag: string;
  username: string;
  challenge_title: string;
  challenge_points: number;
}

interface StudentAccount {
  id: number;
  username: string;
  submission_count: number;
}

async function responseError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  } catch {
    // Keep the fallback for non-JSON proxy and server responses.
  }
  return `${fallback} (HTTP ${response.status})`;
}

export default function AdminDashboard() {
  const [isActive, setIsActive] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [challenges, setChallenges] = useState([]);
  const [newChallenge, setNewChallenge] = useState({ title: "", description: "", points: 100, flag: "", trim_spaces: false, ignore_case: false });
  const [selectedFile, setSelectedFile] = useState<FileList | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingControl, setPendingControl] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [submissionFilter, setSubmissionFilter] = useState<number | "all">("all");
  const [overrideLoading, setOverrideLoading] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (!token || role !== "admin") {
      router.push("/admin");
      return;
    }
    fetchState();
    fetchChallenges();
    fetchSubmissions();
    fetchStudents();
  }, []);

  const fetchState = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/contest/state`);
      if (!res.ok) throw new Error(await responseError(res, "Could not load contest status"));
      const data = await res.json();
      setIsActive(data.is_active);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not reach the API at ${API_BASE_URL}.`);
    }
  };

  const fetchChallenges = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE_URL}/api/challenges`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setChallenges(await res.json());
    }
  };

  const fetchSubmissions = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE_URL}/api/admin/submissions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setSubmissions(await res.json());
    }
  };

  const fetchStudents = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setStudents(await res.json());
  };

  const toggleState = async () => {
    setPendingControl("contest");
    setError("");
    setSuccess("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/admin/contest/state`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !isActive, duration_minutes: !isActive ? durationMinutes : null })
      });
      if (!res.ok) throw new Error(await responseError(res, "Could not update contest status"));
      await fetchState();
      setSuccess(isActive ? "Contest deactivated." : "Contest activated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not reach the API at ${API_BASE_URL}.`);
    } finally {
      setPendingControl(null);
    }
  };

  const addChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isActive) {
      setError("Cannot add challenges while contest is active.");
      return;
    }
    if (selectedFile && selectedFile.length > 5) {
      setError("Attach no more than 5 files to a challenge.");
      return;
    }
    const selectedFiles = selectedFile ? Array.from(selectedFile) : [];
    if (selectedFiles.some(file => file.size > 25 * 1024 * 1024)) {
      setError("Each challenge file must be 25 MB or smaller.");
      return;
    }
    if (selectedFiles.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) {
      setError("The combined challenge files must be 50 MB or smaller.");
      return;
    }
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("title", newChallenge.title);
    formData.append("description", newChallenge.description);
    formData.append("points", newChallenge.points.toString());
    formData.append("flag", newChallenge.flag);
    formData.append("trim_spaces", newChallenge.trim_spaces.toString());
    formData.append("ignore_case", newChallenge.ignore_case.toString());
    if (selectedFile) {
      for (let i = 0; i < selectedFile.length; i++) {
        formData.append("files", selectedFile[i]);
      }
    }

    const res = await fetch(`${API_BASE_URL}/api/admin/challenges`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
    if (res.ok) {
      setNewChallenge({ title: "", description: "", points: 100, flag: "", trim_spaces: false, ignore_case: false });
      setSelectedFile(null);
      setFileInputKey((key) => key + 1);
      fetchChallenges();
      setError("");
    } else {
      const data = await res.json();
      let errorMsg = "Failed to add challenge";
      if (data.detail) {
        if (typeof data.detail === "string") errorMsg = data.detail;
        else if (Array.isArray(data.detail)) errorMsg = data.detail[0].msg;
      }
      setError(errorMsg);
    }
  };

  const deleteChallenge = async (id: number) => {
    if (isActive) {
      setError("Cannot delete challenges while contest is active.");
      return;
    }
    const token = localStorage.getItem("token");
    await fetch(`${API_BASE_URL}/api/admin/challenges/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchChallenges();
  };

  const clearLeaderboard = async () => {
    if (!confirm("Are you sure you want to clear the leaderboard?")) return;
    setPendingControl("leaderboard");
    setError("");
    setSuccess("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/admin/leaderboard`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await responseError(res, "Could not clear leaderboard"));
      await fetchSubmissions();
      setSuccess("Leaderboard cleared.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not reach the API at ${API_BASE_URL}.`);
    } finally {
      setPendingControl(null);
    }
  };

  const clearUsers = async () => {
    if (!confirm("Are you sure? This will delete ALL student accounts and their submissions!")) return;
    setPendingControl("users");
    setError("");
    setSuccess("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await responseError(res, "Could not clear student accounts"));
      await Promise.all([fetchStudents(), fetchSubmissions()]);
      setSuccess("All student accounts and submissions were cleared.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not reach the API at ${API_BASE_URL}.`);
    } finally {
      setPendingControl(null);
    }
  };

  const deleteStudent = async (student: StudentAccount) => {
    if (!confirm(`Delete student “${student.username}” and their ${student.submission_count} submission(s)? This cannot be undone.`)) return;
    setDeletingUserId(student.id);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${student.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not delete this student.");
      }
      await Promise.all([fetchStudents(), fetchSubmissions()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this student.");
    } finally {
      setDeletingUserId(null);
    }
  };

  const overrideSubmission = async (submissionId: number, newIsCorrect: boolean) => {
    setOverrideLoading(submissionId);
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE_URL}/api/admin/submissions/${submissionId}/override`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ is_correct: newIsCorrect })
    });
    if (res.ok) {
      fetchSubmissions();
    } else {
      const data = await res.json();
      setError(data.detail || "Failed to override submission");
    }
    setOverrideLoading(null);
  };

  const logout = () => {
    localStorage.clear();
    router.push("/admin");
  };

  // Group submissions by challenge for the filter
  const challengeIds = [...new Set(submissions.map(s => s.challenge_id))];
  const filteredSubmissions = submissionFilter === "all"
    ? submissions
    : submissions.filter(s => s.challenge_id === submissionFilter);

  return (
    <div>
      <div className="nav-bar">
        <h2>Admin Dashboard [root]</h2>
        <div className="nav-links">
          <Link href="/leaderboard">Leaderboard</Link>
          <button onClick={() => { setShowSubmissions(!showSubmissions); if (!showSubmissions) fetchSubmissions(); }} style={{ padding: "0.4rem 1rem" }}>
            {showSubmissions ? "Hide Submissions" : "View Submissions"}
          </button>
          <button onClick={logout} style={{ padding: "0.4rem 1rem" }}>Logout</button>
        </div>
      </div>

      <div className="container">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3>Contest Control</h3>
          <p>Status: <span className={isActive ? "badge badge-active" : "badge badge-inactive"}>{isActive ? "ACTIVE" : "INACTIVE"}</span></p>
          
          {!isActive && (
            <div style={{ marginTop: "1rem" }}>
              <label>Timer Duration (Minutes): </label>
              <input 
                type="number" 
                value={durationMinutes} 
                onChange={(e) => setDurationMinutes(parseInt(e.target.value))} 
                style={{ width: "100px", display: "inline-block", marginLeft: "1rem", marginBottom: 0 }} 
                min="1"
              />
            </div>
          )}

          <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <button onClick={toggleState} disabled={pendingControl === "contest"}>
              {pendingControl === "contest" ? "Saving…" : isActive ? "Deactivate Contest" : "Activate Contest"}
            </button>
            <button onClick={clearLeaderboard} disabled={pendingControl === "leaderboard"} style={{ borderColor: "var(--error-color)", color: "var(--error-color)" }}>
              {pendingControl === "leaderboard" ? "Clearing…" : "Clear Leaderboard"}
            </button>
            <button onClick={clearUsers} disabled={pendingControl === "users"} style={{ borderColor: "var(--error-color)", color: "var(--error-color)" }}>
              {pendingControl === "users" ? "Clearing…" : "Clear All Users"}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ margin: 0 }}>Student Accounts</h3>
              <p style={{ margin: "0.35rem 0 0", color: "var(--text-dim)", fontSize: "0.85rem" }}>Remove an individual account and its submission history.</p>
            </div>
            <button type="button" onClick={fetchStudents} style={{ padding: "0.4rem 0.8rem" }}>Refresh</button>
          </div>
          {students.length === 0 ? (
            <p style={{ color: "var(--text-dim)", marginBottom: 0 }}>No student accounts found.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {students.map(student => (
                <div key={student.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: "0.7rem 0", borderBottom: "1px solid var(--border-color)", flexWrap: "wrap" }}>
                  <div>
                    <strong>{student.username}</strong>
                    <span style={{ marginLeft: "0.7rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>{student.submission_count} submission{student.submission_count === 1 ? "" : "s"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteStudent(student)}
                    disabled={deletingUserId === student.id}
                    style={{ padding: "0.35rem 0.7rem", borderColor: "var(--error-color)", color: "var(--error-color)" }}
                  >
                    {deletingUserId === student.id ? "Deleting…" : "Delete student"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== SUBMISSIONS PANEL ===== */}
        {showSubmissions && (
          <div className="card" style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
              <h3 style={{ margin: 0 }}>All Submissions</h3>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <label style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>Filter by Challenge:</label>
                <select
                  value={submissionFilter}
                  onChange={(e) => setSubmissionFilter(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                  style={{ width: "auto", marginBottom: 0, padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
                >
                  <option value="all">All Challenges</option>
                  {challengeIds.map(id => {
                    const sub = submissions.find(s => s.challenge_id === id);
                    return (
                      <option key={id} value={id}>
                        {sub?.challenge_title || `Challenge #${id}`}
                      </option>
                    );
                  })}
                </select>
                <button onClick={fetchSubmissions} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}>
                  Refresh
                </button>
              </div>
            </div>

            {filteredSubmissions.length === 0 ? (
              <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem 0" }}>No submissions found.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: "5%" }}>#</th>
                      <th style={{ width: "15%" }}>Student</th>
                      <th style={{ width: "15%" }}>Challenge</th>
                      <th style={{ width: "25%" }}>Submitted Flag</th>
                      <th style={{ width: "10%" }}>Result</th>
                      <th style={{ width: "15%" }}>Time</th>
                      <th style={{ width: "15%" }}>Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map((sub, idx) => (
                      <tr key={sub.id} style={sub.is_correct ? { background: "rgba(0, 255, 65, 0.05)" } : {}}>
                        <td style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{sub.id}</td>
                        <td>{sub.username}</td>
                        <td>
                          <span style={{ fontSize: "0.85rem" }}>{sub.challenge_title}</span>
                          <br />
                          <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{sub.challenge_points} pts</span>
                        </td>
                        <td>
                          <code style={{
                            background: "rgba(0,0,0,0.4)",
                            padding: "0.2rem 0.4rem",
                            borderRadius: "3px",
                            fontSize: "0.85rem",
                            wordBreak: "break-all",
                            border: "1px solid var(--border-color)"
                          }}>
                            {sub.submitted_flag || "(empty)"}
                          </code>
                        </td>
                        <td>
                          <span className={sub.is_correct ? "badge badge-active" : "badge badge-inactive"} style={{ fontSize: "0.75rem" }}>
                            {sub.is_correct ? "✓ CORRECT" : "✗ WRONG"}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.8rem" }}>
                          {new Date(sub.timestamp).toLocaleString()}
                        </td>
                        <td>
                          {overrideLoading === sub.id ? (
                            <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Saving...</span>
                          ) : (
                            <button
                              onClick={() => overrideSubmission(sub.id, !sub.is_correct)}
                              style={{
                                padding: "0.3rem 0.6rem",
                                fontSize: "0.75rem",
                                borderColor: sub.is_correct ? "var(--error-color)" : "var(--text-color)",
                                color: sub.is_correct ? "var(--error-color)" : "var(--text-color)",
                              }}
                              title={sub.is_correct ? "Mark as WRONG" : "Mark as CORRECT"}
                            >
                              {sub.is_correct ? "Mark Wrong" : "Mark Correct"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--text-dim)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <span>Total: {filteredSubmissions.length} submission{filteredSubmissions.length !== 1 ? "s" : ""}</span>
              <span>Correct: {filteredSubmissions.filter(s => s.is_correct).length} | Wrong: {filteredSubmissions.filter(s => !s.is_correct).length}</span>
            </div>
          </div>
        )}

        <div className="grid">
          <div className="card">
            <h3>Add Challenge</h3>
            <form onSubmit={addChallenge}>
              <input type="text" placeholder="Title" value={newChallenge.title} onChange={e => setNewChallenge({...newChallenge, title: e.target.value})} required disabled={isActive} />
              <textarea placeholder="Description" rows={3} value={newChallenge.description} onChange={e => setNewChallenge({...newChallenge, description: e.target.value})} required disabled={isActive}></textarea>
              <input type="number" placeholder="Points" value={newChallenge.points} onChange={e => setNewChallenge({...newChallenge, points: parseInt(e.target.value)})} required disabled={isActive} />
              <input type="text" placeholder="Flag (e.g. CTF{secret})" value={newChallenge.flag} onChange={e => setNewChallenge({...newChallenge, flag: e.target.value})} required disabled={isActive} />
              <label htmlFor="challenge-files" style={{ display: "block", marginBottom: "0.4rem" }}>Downloadable challenge files (optional)</label>
              <input key={fileInputKey} id="challenge-files" type="file" multiple onChange={e => setSelectedFile(e.target.files)} disabled={isActive} style={{ padding: "0.5rem", background: "rgba(0,0,0,0.5)" }} />
              <p style={{ margin: "0.25rem 0 1rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>Attach up to 5 files, 25 MB each. Participants can download them from the challenge card.</p>
              {selectedFile && selectedFile.length > 0 && (
                <ul aria-label="Selected challenge files" style={{ margin: "0 0 1rem", paddingLeft: "1.25rem", fontSize: "0.85rem", color: "var(--text-color)" }}>
                  {Array.from(selectedFile).map((file, index) => <li key={`${file.name}-${index}`}>{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</li>)}
                </ul>
              )}
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                <input type="checkbox" id="trim" checked={newChallenge.trim_spaces} onChange={e => setNewChallenge({...newChallenge, trim_spaces: e.target.checked})} style={{ width: "auto", margin: 0 }} disabled={isActive} />
                <label htmlFor="trim">Trim all spaces</label>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                <input type="checkbox" id="ignore" checked={newChallenge.ignore_case} onChange={e => setNewChallenge({...newChallenge, ignore_case: e.target.checked})} style={{ width: "auto", margin: 0 }} disabled={isActive} />
                <label htmlFor="ignore">Ignore Case</label>
              </div>
              
              <button type="submit" disabled={isActive} style={{ width: "100%" }}>Add Challenge</button>
            </form>
          </div>

          <div>
            <h3>Existing Challenges</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {challenges.map((c: any) => (
                <div key={c.id} className="card" style={{ padding: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <h4>{c.title} ({c.points} pts)</h4>
                    <button onClick={() => deleteChallenge(c.id)} disabled={isActive} style={{ padding: "0.2rem 0.5rem", borderColor: "var(--error-color)", color: "var(--error-color)" }}>X</button>
                  </div>
                  <p style={{ fontSize: "0.9rem", color: "#aaa" }}>{c.description}</p>
                  {c.file_path && (() => {
                    try {
                      const files = JSON.parse(c.file_path);
                      return <p style={{ fontSize: "0.8rem", color: "var(--text-color)" }}>Files: {files.map((f: any) => f.original).join(", ")}</p>;
                    } catch { return <p style={{ fontSize: "0.8rem", color: "var(--text-color)" }}>File: {c.file_path}</p>; }
                  })()}
                  <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>Flag: {c.flag}</p>
                </div>
              ))}
              {challenges.length === 0 && <p>No challenges found.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
