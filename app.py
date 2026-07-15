import asyncio
import json
import random
import datetime as dt
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

import database as db
import analytics

db.init_db()

app = FastAPI(title="Zen Dice Timer")


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()

# Background task: check active sessions and send countdown updates
active_session_end = None
active_session_id = None


async def session_watcher():
    global active_session_end, active_session_id
    while True:
        session = db.get_active_session()
        if session:
            created = dt.datetime.strptime(session["created_at"], "%Y-%m-%d %H:%M:%S")
            end_time = created + dt.timedelta(seconds=session["total_seconds"])
            remaining = max(0, (end_time - dt.datetime.utcnow()).total_seconds())
            active_session_end = end_time
            active_session_id = session["id"]
            status = "running" if remaining > 0 else "time_up"
            await manager.broadcast({
                "type": "session_update",
                "session": session,
                "remaining_seconds": int(remaining),
                "status": status,
            })
            if status == "time_up":
                await manager.broadcast({
                    "type": "session_time_up",
                    "session_id": session["id"],
                })
        else:
            active_session_end = None
            active_session_id = None
            await manager.broadcast({
                "type": "session_update",
                "session": None,
                "remaining_seconds": 0,
                "status": "idle",
            })
        await asyncio.sleep(1)


@app.on_event("startup")
async def startup():
    asyncio.create_task(session_watcher())


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)


# --- REST Endpoints ---

@app.get("/api/sessions/active")
async def get_active():
    session = db.get_active_session()
    remaining = 0
    status = "idle"
    if session:
        created = dt.datetime.strptime(session["created_at"], "%Y-%m-%d %H:%M:%S")
        end_time = created + dt.timedelta(seconds=session["total_seconds"])
        remaining = max(0, (end_time - dt.datetime.utcnow()).total_seconds())
        status = "running" if remaining > 0 else "time_up"
    return {"session": session, "remaining_seconds": int(remaining), "status": status}


@app.post("/api/sessions")
async def create_session(data: dict):
    task = data.get("task", "")
    minutes = data.get("minutes", 30)
    total_seconds = minutes * 60
    session = db.create_session(task, minutes, total_seconds)
    return {"session": session}


@app.post("/api/sessions/{session_id}/complete")
async def complete(session_id: int, data: dict):
    progress = data.get("progress_percent", 100)
    satisfaction = data.get("satisfaction_rating", 3)
    session = db.complete_session(session_id, progress, satisfaction)
    return {"session": session}


@app.post("/api/sessions/{session_id}/cancel")
async def cancel(session_id: int):
    session = db.cancel_session(session_id)
    return {"session": session}


@app.get("/api/sessions/history")
async def history(limit: int = 50, offset: int = 0):
    return {"sessions": db.get_session_history(limit, offset)}


@app.get("/api/config")
async def get_config():
    val = db.get_config("enabled_minutes")
    return {"enabled_minutes": json.loads(val) if val else [10, 20, 30, 40, 50, 60]}


@app.put("/api/config")
async def update_config(data: dict):
    minutes = data.get("enabled_minutes", [10, 20, 30, 40, 50, 60])
    db.set_config("enabled_minutes", json.dumps(minutes))
    return {"enabled_minutes": minutes}


@app.get("/api/analytics/summary")
async def analytics_summary():
    return analytics.get_summary()


@app.get("/api/analytics/weekly")
async def analytics_weekly():
    return {"data": analytics.get_weekly()}


@app.get("/api/analytics/monthly")
async def analytics_monthly():
    return {"data": analytics.get_monthly()}


@app.get("/api/analytics/satisfaction-heatmap")
async def analytics_heatmap():
    return {"data": analytics.get_satisfaction_heatmap()}


@app.get("/api/analytics/progress-by-duration")
async def analytics_progress_duration():
    return {"data": analytics.get_progress_by_duration()}


@app.get("/api/analytics/progress-by-weekday")
async def analytics_progress_weekday():
    return {"data": analytics.get_progress_by_weekday()}


@app.get("/api/analytics/streaks")
async def analytics_streaks():
    return analytics.get_daily_streaks()


@app.get("/api/analytics/keywords")
async def analytics_keywords():
    return {"data": analytics.get_keyword_clusters()}


# Static files & SPA fallback
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def index():
    return FileResponse(os.path.join(static_dir, "index.html"))
