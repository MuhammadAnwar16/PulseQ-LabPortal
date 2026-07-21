"""Realtime pub/sub over WebSocket.

Mirrors the rest-of-app pattern: when an order or resource changes we publish to the
`hospital_<id>` room (and `doctor_<id>` room when a doctor is attached).
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("pulseq.realtime")


class RealtimeManager:
    def __init__(self) -> None:
        # room name -> set of connected websockets
        self._rooms: dict[str, set[WebSocket]] = {}

    def _room(self, name: str) -> set[WebSocket]:
        return self._rooms.setdefault(name, set())

    async def connect(self, room: str, ws: WebSocket) -> None:
        await ws.accept()
        self._room(room).add(ws)
        logger.info("realtime: ws joined room=%s (total=%d)", room, len(self._rooms[room]))

    def disconnect(self, room: str, ws: WebSocket) -> None:
        subs = self._rooms.get(room)
        if subs and ws in subs:
            subs.discard(ws)
            if not subs:
                self._rooms.pop(room, None)

    async def publish(self, room: str, payload: dict[str, Any]) -> None:
        subs = list(self._rooms.get(room, set()))
        dead: list[WebSocket] = []
        for ws in subs:
            try:
                await ws.send_text(json.dumps(payload, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room, ws)


manager = RealtimeManager()


def hospital_room(hospital_id: str) -> str:
    return f"hospital_{hospital_id}"


def doctor_room(doctor_id: str) -> str:
    return f"doctor_{doctor_id}"


async def _publish_to_rooms(
    hospital_id: str, doctor_id: str | None, payload: dict[str, Any]
) -> None:
    await manager.publish(hospital_room(hospital_id), payload)
    if doctor_id:
        await manager.publish(doctor_room(doctor_id), payload)


def broadcast_lab_event(
    hospital_id: str,
    event_type: str,
    data: dict[str, Any],
    doctor_id: str | None = None,
) -> None:
    """Broadcast a typed realtime event to hospital_<id> and optional doctor_<id> room."""
    payload: dict[str, Any] = {
        "type": event_type,
        "data": data,
    }
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_publish_to_rooms(hospital_id, doctor_id, payload))
    except RuntimeError:
        logger.debug("realtime: no running loop; skipping broadcast")


def notify_queue_update(
    hospital_id: str,
    doctor_id: str | None,
    *,
    event: str,
    order_id: str,
    status: str,
    extra: dict[str, Any] | None = None,
) -> None:
    """Legacy helper maintained for compatibility."""
    data = {
        "event": event,
        "order_id": order_id,
        "status": status,
    }
    if extra:
        data.update(extra)
    broadcast_lab_event(hospital_id, "lab_queue_update", data, doctor_id=doctor_id)


router = APIRouter()


@router.websocket("/ws")
async def realtime_ws(websocket: WebSocket, room: str = "") -> None:
    """Subscribe to a room, e.g. /api/v1/staff/laboratory/ws?room=hospital_<id>."""
    if not room:
        await websocket.accept()
        await websocket.send_text(json.dumps({"type": "error", "detail": "room required"}))
        await websocket.close()
        return
    await manager.connect(room, websocket)
    try:
        while True:
            # We only broadcast; ignore inbound messages but keep socket alive.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(room, websocket)
