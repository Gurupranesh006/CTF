from fastapi import FastAPI, HTTPException, Depends, status, Form, File, UploadFile
from fastapi.responses import FileResponse
import os
import json
import re
import uuid
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer

from database import init_db, get_db
from seed_challenges import seed_challenges

app = FastAPI()
cors_origins = [origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "*").split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_CHALLENGE_FILE_BYTES = 25 * 1024 * 1024
MAX_CHALLENGE_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_CHALLENGE_FILES = 5

SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_ctf_key")
ALGORITHM = "HS256"
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD") or (None if os.getenv("RENDER") else "rvce@best")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=1440)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"username": username, "role": role}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_admin_user(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not an admin")
    return user

@app.on_event("startup")
def startup():
    init_db()
    seed_challenges()

# --- Schemas ---
class LoginRequest(BaseModel):
    username: str
    password: str

class StudentJoinRequest(BaseModel):
    username: str

class ChallengeCreate(BaseModel):
    title: str
    description: str
    points: int
    flag: str
    trim_spaces: bool
    ignore_case: bool
    category: str = "web"
    difficulty: str = "hard"
    target_url: Optional[str] = None
    reference_url: Optional[str] = None

class ChallengeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    points: Optional[int] = None
    flag: Optional[str] = None
    trim_spaces: Optional[bool] = None
    ignore_case: Optional[bool] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    target_url: Optional[str] = None
    reference_url: Optional[str] = None

class FlagSubmit(BaseModel):
    flag: str

class ContestStateUpdate(BaseModel):
    is_active: bool
    duration_minutes: Optional[int] = None

# --- Endpoints ---

@app.post("/api/admin/login")
def admin_login(req: LoginRequest):
    if ADMIN_PASSWORD and req.username == ADMIN_USERNAME and req.password == ADMIN_PASSWORD:
        token = create_access_token({"sub": ADMIN_USERNAME, "role": "admin"})
        return {"access_token": token, "role": "admin"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/student/login")
def student_login(req: StudentJoinRequest):
    req_username = req.username.strip()
    if not req_username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT * FROM user WHERE username = ?", (req_username,))
        user = cursor.fetchone()
        
        is_returning = False
        if not user:
            cursor.execute("INSERT INTO user (username, password) VALUES (?, ?)", (req_username, ""))
            db.commit()
        else:
            is_returning = True
            
        token = create_access_token({"sub": req_username, "role": "student"})
        return {"access_token": token, "role": "student", "is_returning": is_returning}

@app.get("/api/users/present")
def get_present_users():
    """Get list of all already registered student usernames."""
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT username FROM user ORDER BY username COLLATE NOCASE ASC")
        users = [row["username"] for row in cursor.fetchall()]
        return {"users": users}

@app.get("/api/contest/state")
def get_contest_state():
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT is_active, end_time FROM contest WHERE id = 1")
        row = cursor.fetchone()
        is_active = bool(row["is_active"])
        end_time = row["end_time"]
        
        if is_active and end_time:
            end_dt = datetime.fromisoformat(end_time.replace("Z", ""))
            if datetime.utcnow() > end_dt:
                is_active = False
                cursor.execute("UPDATE contest SET is_active = 0 WHERE id = 1")
                db.commit()
                
        return {"is_active": is_active, "end_time": end_time if is_active else None}

@app.put("/api/admin/contest/state")
def update_contest_state(req: ContestStateUpdate, _: dict = Depends(get_admin_user)):
    with get_db() as db:
        cursor = db.cursor()
        end_time = None
        if req.is_active and req.duration_minutes:
            end_time = (datetime.utcnow() + timedelta(minutes=req.duration_minutes)).isoformat() + "Z"
            
        cursor.execute("UPDATE contest SET is_active = ?, end_time = ? WHERE id = 1", (req.is_active, end_time))
        db.commit()
        return {"message": "Contest state updated"}

@app.get("/api/challenges")
def get_challenges(user: dict = Depends(get_current_user)):
    # if student, check if contest is active
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT is_active, end_time FROM contest WHERE id = 1")
        row = cursor.fetchone()
        is_active = bool(row["is_active"])
        end_time = row["end_time"]
        
        if is_active and end_time:
            end_dt = datetime.fromisoformat(end_time.replace("Z", ""))
            if datetime.utcnow() > end_dt:
                is_active = False
                cursor.execute("UPDATE contest SET is_active = 0 WHERE id = 1")
                db.commit()
        
        if user["role"] != "admin" and not is_active:
            raise HTTPException(status_code=403, detail="Contest is not active")
            
        cursor.execute("SELECT * FROM challenge")
        challenges = [dict(row) for row in cursor.fetchall()]
        
        # Hide flags for students
        if user["role"] != "admin":
            for c in challenges:
                c.pop("flag")
                c.pop("trim_spaces")
                c.pop("ignore_case")
                
                # Check if user already solved it
                cursor.execute("SELECT id FROM user WHERE username = ?", (user["username"],))
                user_id = cursor.fetchone()["id"]
                cursor.execute("SELECT id FROM submission WHERE user_id = ? AND challenge_id = ? AND is_correct = 1", (user_id, c["id"]))
                c["solved"] = cursor.fetchone() is not None
                
        return challenges

@app.post("/api/admin/challenges")
def create_challenge(
    title: str = Form(...),
    description: str = Form(...),
    points: int = Form(...),
    flag: str = Form(...),
    trim_spaces: bool = Form(...),
    ignore_case: bool = Form(...),
    category: str = Form("web"),
    difficulty: str = Form("hard"),
    target_url: Optional[str] = Form(None),
    reference_url: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    _: dict = Depends(get_admin_user)
):
    if len(files) > MAX_CHALLENGE_FILES:
        raise HTTPException(status_code=413, detail=f"You can attach up to {MAX_CHALLENGE_FILES} files")

    prepared_files = []
    total_bytes = 0
    for f in files:
        if f.filename:
            original_name = os.path.basename(f.filename.replace("\\", "/"))
            safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", original_name).strip("._") or "challenge-file"
            content = f.file.read(MAX_CHALLENGE_FILE_BYTES + 1)
            if len(content) > MAX_CHALLENGE_FILE_BYTES:
                raise HTTPException(status_code=413, detail=f"{safe_name} exceeds the 25 MB per-file limit")
            total_bytes += len(content)
            if total_bytes > MAX_CHALLENGE_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="The combined upload cannot exceed 50 MB")
            prepared_files.append((safe_name, content))

    saved_files = []
    created_paths = []
    for safe_name, content in prepared_files:
        unique_name = f"{uuid.uuid4().hex}_{safe_name}"
        fpath = os.path.join(UPLOAD_DIR, unique_name)
        with open(fpath, "wb") as buffer:
            buffer.write(content)
        created_paths.append(fpath)
        saved_files.append({"original": safe_name, "stored": unique_name})
    
    file_data = json.dumps(saved_files) if saved_files else None
            
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute('''
        INSERT INTO challenge
        (title, description, points, flag, trim_spaces, ignore_case, file_path,
         category, difficulty, target_url, reference_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            title, description, points, flag, trim_spaces, ignore_case, file_data,
            category, difficulty, target_url, reference_url
        ))
        try:
            db.commit()
        except Exception:
            for fpath in created_paths:
                try:
                    os.remove(fpath)
                except OSError:
                    pass
            raise
        return {"message": "Challenge created", "files": saved_files}

@app.get("/api/files/{filename:path}")
def download_file(filename: str):
    safe_filename = os.path.basename(filename)
    upload_root = os.path.realpath(UPLOAD_DIR)
    fpath = os.path.realpath(os.path.join(upload_root, safe_filename))
    if safe_filename != filename or os.path.commonpath((upload_root, fpath)) != upload_root or not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="File not found")
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT file_path FROM challenge WHERE file_path IS NOT NULL")
        referenced = False
        for row in cursor.fetchall():
            try:
                entries = json.loads(row["file_path"])
                if isinstance(entries, list) and any(item.get("stored") == safe_filename for item in entries if isinstance(item, dict)):
                    referenced = True
                    break
            except (json.JSONDecodeError, TypeError):
                if os.path.basename(row["file_path"]) == safe_filename:
                    referenced = True
                    break
    if not referenced:
        raise HTTPException(status_code=404, detail="File not found")
    # For UUID-prefixed files, strip the prefix for the download name
    display_name = safe_filename.split("_", 1)[1] if "_" in safe_filename and len(safe_filename.split("_", 1)[0]) == 32 else safe_filename
    return FileResponse(fpath, filename=display_name)

@app.put("/api/admin/challenges/{challenge_id}")
def update_challenge(challenge_id: int, req: ChallengeUpdate, _: dict = Depends(get_admin_user)):
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT is_active FROM contest WHERE id = 1")
        if cursor.fetchone()["is_active"]:
            raise HTTPException(status_code=400, detail="Cannot edit challenges while contest is active")
            
        cursor.execute("SELECT * FROM challenge WHERE id = ?", (challenge_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Challenge not found")
            
        update_data = req.dict(exclude_unset=True)
        if update_data:
            keys = ", ".join([f"{k} = ?" for k in update_data.keys()])
            values = list(update_data.values())
            values.append(challenge_id)
            cursor.execute(f"UPDATE challenge SET {keys} WHERE id = ?", values)
            db.commit()
        return {"message": "Challenge updated"}

@app.delete("/api/admin/challenges/{challenge_id}")
def delete_challenge(challenge_id: int, _: dict = Depends(get_admin_user)):
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT is_active FROM contest WHERE id = 1")
        if cursor.fetchone()["is_active"]:
            raise HTTPException(status_code=400, detail="Cannot delete challenges while contest is active")
        cursor.execute("DELETE FROM challenge WHERE id = ?", (challenge_id,))
        db.commit()
        return {"message": "Challenge deleted"}

@app.post("/api/student/challenges/{challenge_id}/submit")
def submit_flag(challenge_id: int, req: FlagSubmit, user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can submit flags")
        
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT is_active, end_time FROM contest WHERE id = 1")
        row = cursor.fetchone()
        is_active = bool(row["is_active"])
        end_time = row["end_time"]
        
        if is_active and end_time:
            end_dt = datetime.fromisoformat(end_time.replace("Z", ""))
            if datetime.utcnow() > end_dt:
                is_active = False
                cursor.execute("UPDATE contest SET is_active = 0 WHERE id = 1")
                db.commit()
                
        if not is_active:
            raise HTTPException(status_code=403, detail="Contest is not active")
            
        cursor.execute("SELECT * FROM challenge WHERE id = ?", (challenge_id,))
        challenge = cursor.fetchone()
        if not challenge:
            raise HTTPException(status_code=404, detail="Challenge not found")
            
        cursor.execute("SELECT id FROM user WHERE username = ?", (user["username"],))
        user_id = cursor.fetchone()["id"]
        
        # Check if already solved
        cursor.execute("SELECT id FROM submission WHERE user_id = ? AND challenge_id = ? AND is_correct = 1", (user_id, challenge_id))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Already solved")
            
        submitted_flag = req.flag
        correct_flag = challenge["flag"]
        
        if challenge["trim_spaces"]:
            submitted_flag = submitted_flag.replace(" ", "")
            correct_flag = correct_flag.replace(" ", "")
            
        if challenge["ignore_case"]:
            submitted_flag = submitted_flag.lower()
            correct_flag = correct_flag.lower()
            
        is_correct = (submitted_flag == correct_flag)
        
        cursor.execute("INSERT INTO submission (user_id, challenge_id, is_correct, submitted_flag) VALUES (?, ?, ?, ?)", 
                       (user_id, challenge_id, is_correct, req.flag))
        db.commit()
        
        return {"is_correct": is_correct}

# --- Admin Submissions Endpoints ---

class SubmissionOverride(BaseModel):
    is_correct: bool

@app.get("/api/admin/submissions")
def get_all_submissions(_: dict = Depends(get_admin_user)):
    """Get all submissions grouped by challenge, with username and submitted flag."""
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute('''
            SELECT s.id, s.user_id, s.challenge_id, s.timestamp, s.is_correct, s.submitted_flag,
                   u.username, c.title as challenge_title, c.points as challenge_points
            FROM submission s
            JOIN user u ON s.user_id = u.id
            JOIN challenge c ON s.challenge_id = c.id
            ORDER BY c.id ASC, s.timestamp DESC
        ''')
        results = [dict(row) for row in cursor.fetchall()]
        return results

@app.put("/api/admin/submissions/{submission_id}/override")
def override_submission(submission_id: int, req: SubmissionOverride, _: dict = Depends(get_admin_user)):
    """Manually override a specific submission's correctness."""
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT * FROM submission WHERE id = ?", (submission_id,))
        submission = cursor.fetchone()
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        cursor.execute("UPDATE submission SET is_correct = ? WHERE id = ?", (req.is_correct, submission_id))
        db.commit()
        return {"message": "Submission overridden successfully", "new_is_correct": req.is_correct}

@app.get("/api/leaderboard")
def get_leaderboard():
    with get_db() as db:
        cursor = db.cursor()
        # Award each challenge's points once on its first accepted submission.
        query = '''
        SELECT u.username,
               SUM(c.points) as score,
               MAX(s.first_solve) as last_submission
        FROM user u
        JOIN (
            SELECT user_id, challenge_id, MIN(timestamp) as first_solve
            FROM submission
            WHERE is_correct = 1
            GROUP BY user_id, challenge_id
        ) s ON u.id = s.user_id
        JOIN challenge c ON s.challenge_id = c.id
        GROUP BY u.id
        ORDER BY score DESC, last_submission ASC
        '''
        cursor.execute(query)
        results = [dict(row) for row in cursor.fetchall()]
        return results

@app.delete("/api/admin/leaderboard")
def clear_leaderboard(_: dict = Depends(get_admin_user)):
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM submission")
        db.commit()
        return {"message": "Leaderboard cleared"}

@app.delete("/api/admin/users")
def clear_users(_: dict = Depends(get_admin_user)):
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM submission")
        cursor.execute("DELETE FROM user")
        db.commit()
        return {"message": "All users and submissions cleared"}

@app.get("/api/admin/users")
def get_admin_users(_: dict = Depends(get_admin_user)):
    """List student accounts and their submission counts for user management."""
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute('''
            SELECT u.id, u.username, COUNT(s.id) AS submission_count
            FROM user u
            LEFT JOIN submission s ON s.user_id = u.id
            GROUP BY u.id, u.username
            ORDER BY u.username COLLATE NOCASE ASC
        ''')
        return [dict(row) for row in cursor.fetchall()]

@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, _: dict = Depends(get_admin_user)):
    """Delete one student and their submissions."""
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("SELECT id, username FROM user WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Student not found")

        cursor.execute("DELETE FROM submission WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM user WHERE id = ?", (user_id,))
        db.commit()
        return {"message": "Student and submissions deleted", "username": user["username"]}
