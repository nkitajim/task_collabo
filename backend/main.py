# main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import SQLModel, Field, create_engine, Session, select, Relationship
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
import uuid, jwt, time, asyncio
from datetime import datetime

# -------------------------
# Config (change for prod)
# -------------------------
JWT_SECRET = "ELYj5p-CWKuP2l68DTfGYWcLoUBdTWI3jzSW5EnP-bb7cG_d3uoez7sX0o87Q4y5"
JWT_ALG = "HS256"
ACCESS_EXPIRE_SECONDS = 60 * 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Realtime Task Board (FastAPI + WebSocket)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# DB models (SQLModel)
# -------------------------
class BoardUserLink(SQLModel, table=True):
    board_id: Optional[int] = Field(default=None, foreign_key="board.id", primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", primary_key=True)
    role: str = Field(default="member")  # owner / member

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    hashed_password: str
    name: Optional[str] = None

class Board(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(default="New Board")

class Column(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    board_id: int = Field(foreign_key="board.id")
    title: str
    position: int = Field(default=0)

class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    summary: Optional[str] = ""
    description: Optional[str] = ""
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: Optional[datetime] = None
    owner: Optional[str] = ""
    assignee: Optional[str] = ""
    reward: float = 0.0
    position: int = 0
    column_id: int

class TaskCreate(BaseModel):
    title: str
    summary: Optional[str] = ""
    description: Optional[str] = ""
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    owner: Optional[str] = ""
    assignee: Optional[str] = ""
    reward: Optional[float] = 0.0

class TaskUpdate(BaseModel):
    title: Optional[str]
    summary: Optional[str]
    description: Optional[str]
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    owner: Optional[str]
    assignee: Optional[str]
    reward: Optional[float]

# -------------------------
# DB init
# -------------------------
sqlite_file_name = "db.sqlite"
engine = create_engine(f"sqlite:///{sqlite_file_name}", connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)

# -------------------------
# Auth helpers
# -------------------------
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode.update({"exp": int(time.time()) + ACCESS_EXPIRE_SECONDS})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALG)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

bearer = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    with Session(engine) as sess:
        user = sess.get(User, user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

# -------------------------
# Pydantic models for input
# -------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class CreateBoardIn(BaseModel):
    title: Optional[str] = "New Board"

class CreateColumnIn(BaseModel):
    title: str
    position: Optional[int] = 0

class CreateTaskIn(BaseModel):
    title: str
    description: Optional[str] = None
    assignee_id: Optional[int] = None

# -------------------------
# Simple Auth endpoints
# -------------------------
@app.post("/auth/register")
def register(payload: RegisterIn):
    with Session(engine) as sess:
        exists = sess.exec(select(User).where(User.email == payload.email)).first()
        if exists:
            raise HTTPException(status_code=400, detail="User already exists")
        u = User(email=payload.email, hashed_password=get_password_hash(payload.password), name=payload.name)
        sess.add(u)
        sess.commit()
        sess.refresh(u)
        token = create_access_token({"user_id": u.id})
        return {"access_token": token, "user": {"id": u.id, "email": u.email, "name": u.name}}

@app.post("/auth/login")
def login(payload: LoginIn):
    with Session(engine) as sess:
        user = sess.exec(select(User).where(User.email == payload.email)).first()
        if not user or not verify_password(payload.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Bad credentials")
        token = create_access_token({"user_id": user.id})
        return {"access_token": token, "user": {"id": user.id, "email": user.email, "name": user.name}}

# -------------------------
# Board/Column/Task APIs
# -------------------------
@app.post("/boards")
def create_board(payload: CreateBoardIn, me: User = Depends(get_current_user)):
    with Session(engine) as sess:
        b = Board(title=payload.title)
        sess.add(b); sess.commit(); sess.refresh(b)
        # link user as owner
        link = BoardUserLink(board_id=b.id, user_id=me.id, role="owner")
        sess.add(link); sess.commit()
        return {"board": {"id": b.id, "title": b.title}}

@app.get("/boards")
def list_boards(me: User = Depends(get_current_user)):
    with Session(engine) as sess:
        stmt = select(Board).join(BoardUserLink, Board.id == BoardUserLink.board_id).where(BoardUserLink.user_id == me.id)
        boards = sess.exec(stmt).all()
        # simple serialize
        return [{"id": b.id, "title": b.title} for b in boards]

@app.get("/boards/{board_id}/full")
def get_board_full(board_id: int, me: User = Depends(get_current_user)):
    # Return board with columns & tasks structured, but only if member
    with Session(engine) as sess:
        membership = sess.exec(select(BoardUserLink).where(BoardUserLink.board_id==board_id, BoardUserLink.user_id==me.id)).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member of this board")
        board = sess.get(Board, board_id)
        if not board:
            raise HTTPException(status_code=404, detail="Board not found")
        cols = sess.exec(select(Column).where(Column.board_id==board_id).order_by(Column.position)).all()
        result_cols = []
        for c in cols:
            tasks = sess.exec(select(Task).where(Task.column_id==c.id).order_by(Task.position)).all()
            result_cols.append({
                "id": c.id,
                "title": c.title,
                "position": c.position,
                "tasks": [ {"id": t.id, "title": t.title, "description": t.description, "position": t.position, "assignee_id": t.assignee_id, "column_id": t.column_id} for t in tasks ]
            })
        return {"id": board.id, "title": board.title, "columns": result_cols}

@app.post("/boards/{board_id}/columns")
async def create_column(board_id: int, payload: CreateColumnIn, me: User = Depends(get_current_user)):
    # must be board member
    with Session(engine) as sess:
        membership = sess.exec(select(BoardUserLink).where(BoardUserLink.board_id==board_id, BoardUserLink.user_id==me.id)).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member of this board")
        col = Column(board_id=board_id, title=payload.title, position=payload.position or 0)
        sess.add(col); sess.commit(); sess.refresh(col)
        # broadcast
        asyncio.create_task(manager.broadcast(board_id, {"type":"column_created","column":{"id":col.id,"title":col.title,"position":col.position}}))
        return {"id": col.id, "title": col.title, "position": col.position}

@app.delete("/boards/{board_id}/columns/{column_id}")
async def delete_column(board_id: int, column_id: int):
    col = db.query(Column).filter(Column.id == column_id, Column.board_id == board_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")

    db.delete(col)
    db.commit()

    # WebSocketで他ユーザーに通知
    asyncio.create_task(manager.broadcast(board_id, {
        "type": "column_deleted",
        "column_id": column_id
    }))
    return {"detail": "Column deleted"}

@app.post("/columns/{column_id}/tasks")
async def create_task(column_id: int, task: TaskCreate):
    t = Task(
        column_id=column_id,
        title=task.title,
        summary=task.summary,
        description=task.description,
        start_date=task.start_date or datetime.utcnow(),
        end_date=task.end_date,
        owner=task.owner,
        assignee=task.assignee,
        reward=task.reward
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    asyncio.create_task(manager.broadcast(t.column.board_id, {
        "type": "task_created",
        "task": serialize_task(t)  # dictに変換
    }))
    return serialize_task(t)

@app.put("/tasks/{task_id}")
async def update_task(task_id: int, task: TaskUpdate):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.title = task.title
    t.description = task.description
    db.commit()
    db.refresh(t)
    asyncio.create_task(manager.broadcast(t.column.board_id, {"type": "task_updated", "task": {"id": t.id, "title": t.title, "description": t.description, "position": t.position, "column_id": t.column_id}}))
    return t

@app.delete("/tasks/{task_id}")
async def delete_task(task_id: int):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    column_id = t.column_id
    board_id = t.column.board_id
    db.delete(t)
    db.commit()
    asyncio.create_task(manager.broadcast(board_id, {"type": "task_deleted", "task_id": task_id, "column_id": column_id}))
    return {"detail": "Task deleted"}

@app.post("/tasks/reorder")
def reorder_tasks(payload: Dict[str, Any] = Body(...), me: User = Depends(get_current_user)):
    # payload: { "board_id": int, "columns": [ { "id": col_id, "task_ids": [id,...] }, ... ] }
    board_id = payload.get("board_id")
    columns = payload.get("columns", [])
    if not board_id:
        raise HTTPException(status_code=400, detail="board_id required")
    with Session(engine) as sess:
        membership = sess.exec(select(BoardUserLink).where(BoardUserLink.board_id==board_id, BoardUserLink.user_id==me.id)).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member")
        for c in columns:
            col_id = c.get("id")
            task_ids = c.get("task_ids", [])
            for idx, tid in enumerate(task_ids):
                t = sess.get(Task, tid)
                if t:
                    t.column_id = col_id
                    t.position = idx
                    sess.add(t)
        sess.commit()
        asyncio.create_task(manager.broadcast(board_id, {"type":"reorder", "data": payload}))
        return {"status":"ok"}

@app.post("/tasks/{task_id}/assign")
def assign_task(task_id: int, body: Dict[str, int], me: User = Depends(get_current_user)):
    # body: { "assignee_id": int }
    assignee_id = body.get("assignee_id")
    with Session(engine) as sess:
        t = sess.get(Task, task_id)
        if not t:
            raise HTTPException(status_code=404, detail="Task not found")
        # check membership
        col = sess.get(Column, t.column_id)
        membership = sess.exec(select(BoardUserLink).where(BoardUserLink.board_id==col.board_id, BoardUserLink.user_id==me.id)).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member")
        t.assignee_id = assignee_id
        sess.add(t); sess.commit(); sess.refresh(t)
        asyncio.create_task(manager.broadcast(col.board_id, {"type":"task_assigned", "task":{"id":t.id,"assignee_id":t.assignee_id}}))
        return {"status":"ok", "task": {"id":t.id,"assignee_id":t.assignee_id}}

# -------------------------
# WebSocket manager
# -------------------------
class ConnectionManager:
    def __init__(self):
        self.active: Dict[int, List[WebSocket]] = {}  # board_id -> websockets list

    async def connect(self, board_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active.setdefault(board_id, []).append(websocket)

    def disconnect(self, board_id: int, websocket: WebSocket):
        lst = self.active.get(board_id, [])
        if websocket in lst:
            lst.remove(websocket)

    async def broadcast(self, board_id: int, message: dict):
        conns = list(self.active.get(board_id, []))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                # ignore broken sockets
                pass

manager = ConnectionManager()

@app.websocket("/ws/boards/{board_id}")
async def board_ws(websocket: WebSocket, board_id: int):
    """
    WebSocket connection for a board.
    Client must connect with query param ?token=<jwt>
    Example: ws://localhost:8000/ws/boards/1?token=eyJ...
    """
    try:
        # accept but validate token param
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=1008)
            return
        try:
            payload = decode_token(token)
        except HTTPException:
            await websocket.close(code=1008)
            return
        user_id = payload.get("user_id")
        if not user_id:
            await websocket.close(code=1008)
            return
        # verify membership
        with Session(engine) as sess:
            membership = sess.exec(select(BoardUserLink).where(BoardUserLink.board_id==board_id, BoardUserLink.user_id==user_id)).first()
            if not membership:
                await websocket.close(code=1008)
                return
        await manager.connect(board_id, websocket)
        # keep receiving to detect disconnects; client need not send
        try:
            while True:
                # we expect no specific messages; just keep connection alive
                msg = await websocket.receive_text()
                # optionally process ping messages
                # ignore or echo
        except WebSocketDisconnect:
            manager.disconnect(board_id, websocket)
        except Exception:
            manager.disconnect(board_id, websocket)
    except Exception:
        try:
            await websocket.close()
        except:
            pass

# -------------------------
# Bootstrap demo data endpoint (optional)
# -------------------------
@app.post("/_bootstrap_demo")
def bootstrap_demo(me: User = Depends(get_current_user)):
    """Create a demo board / columns / tasks for the current user (for quick local testing)."""
    with Session(engine) as sess:
        b = Board(title="Demo Board")
        sess.add(b); sess.commit(); sess.refresh(b)
        sess.add(BoardUserLink(board_id=b.id, user_id=me.id, role="owner"))
        sess.commit()
        c1 = Column(board_id=b.id, title="To Do", position=0)
        c2 = Column(board_id=b.id, title="Doing", position=1)
        c3 = Column(board_id=b.id, title="Done", position=2)
        sess.add_all([c1,c2,c3]); sess.commit()
        # tasks
        t1 = Task(column_id=c1.id, title="調査タスク", position=0)
        t2 = Task(column_id=c1.id, title="設計タスク", position=1)
        t3 = Task(column_id=c2.id, title="実装タスク", position=0)
        sess.add_all([t1,t2,t3]); sess.commit()
        return {"board_id": b.id}

# -------------------------
# Root
# -------------------------
@app.get("/")
def root():
    return {"ok": True, "msg": "Realtime Task Board backend running"}
