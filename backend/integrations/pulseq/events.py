"""Outbound WebSocket notification events sent via HTTP POST to PulseQ's realtime notify endpoint.

When a lab result is verified or an order status updates, this module sends an
HTTP POST request to PulseQ's ``/staff/realtime/notify/{room}`` endpoint, signed
with an HMAC-SHA256 signature in the ``X-PulseQ-Signature`` header.

The events target PulseQ's rooms:
  - ``hospital_<id>``
  - ``doctor_<id>``

If integration is inactive or PULSEQ_API_BASE_URL is unconfigured, events are skipped cleanly.
"""
from __future__ import annotations

import json
import logging
from typing import Any
import urllib.request
import urllib.error

from integrations.pulseq.config import integration_settings
from integrations.pulseq.auth import compute_signature

logger = logging.getLogger("pulseq.integration.events")


async def _post_to_pulseq_room(room: str, payload: dict[str, Any]) -> None:
    """Send an HTTP POST request to PulseQ's realtime notify endpoint for a room."""
    if not integration_settings.is_active or not integration_settings.PULSEQ_API_BASE_URL:
        logger.debug("Integration inactive or PulseQ API URL empty; skipping notification to %s", room)
        return

    base_url = integration_settings.PULSEQ_API_BASE_URL.rstrip("/")
    url = f"{base_url}/staff/realtime/notify/{room}"

    body_bytes = json.dumps(payload, default=str).encode("utf-8")
    signature = compute_signature(body_bytes)

    req = urllib.request.Request(
        url,
        data=body_bytes,
        headers={
            "Content-Type": "application/json",
            "X-PulseQ-Signature": signature,
        },
        method="POST",
    )

    try:
        import asyncio
        loop = asyncio.get_event_loop()

        def _do_post():
            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    logger.debug("Successfully notified PulseQ room %s (status %s)", room, resp.status)
            except urllib.error.HTTPError as e:
                logger.warning("PulseQ notify endpoint for room %s returned status %s: %s", room, e.code, e.reason)
            except Exception as e:
                logger.error("Failed to notify PulseQ room %s: %s", room, e)

        if loop.is_running():
            await loop.run_in_executor(None, _do_post)
        else:
            _do_post()

    except Exception as e:
        logger.error("Error dispatching notification to PulseQ room %s: %s", room, e)


async def emit_result_ready(
    *,
    hospital_id: str,
    doctor_id: str | None,
    order_id: str,
    patient_id: str | None = None,
    patient_name: str | None = None,
    pulseq_token_id: str | None = None,
    test_names: list[str] | None = None,
    status: str = "reported",
    abnormal_flags: list[str] | None = None,
    report_available: bool = False,
) -> None:
    """Emit a ``LAB_RESULT_READY`` notification to PulseQ's rooms via HTTP POST.

    Targeting both ``hospital_<id>`` and ``doctor_<id>`` rooms.
    """
    payload: dict[str, Any] = {
        "type": "LAB_RESULT_READY",
        "data": {
            "order_id": order_id,
            "patient_id": patient_id,
            "patient_name": patient_name,
            "token_id": pulseq_token_id,
            "test_names": test_names or [],
            "status": status,
            "abnormal_flags": abnormal_flags or [],
            "report_available": report_available,
        },
    }

    rooms: list[str] = []
    if hospital_id:
        rooms.append(f"hospital_{hospital_id}")
    if doctor_id:
        rooms.append(f"doctor_{doctor_id}")

    for room in rooms:
        await _post_to_pulseq_room(room, payload)

    logger.info("LAB_RESULT_READY HTTP notification dispatched for order %s to %d room(s)", order_id, len(rooms))


async def emit_order_status_change(
    *,
    hospital_id: str,
    doctor_id: str | None,
    order_id: str,
    old_status: str,
    new_status: str,
    pulseq_token_id: str | None = None,
) -> None:
    """Emit a ``LAB_ORDER_UPDATE`` notification to PulseQ's rooms via HTTP POST."""
    payload: dict[str, Any] = {
        "type": "LAB_ORDER_UPDATE",
        "data": {
            "order_id": order_id,
            "old_status": old_status,
            "new_status": new_status,
            "token_id": pulseq_token_id,
        },
    }

    rooms: list[str] = []
    if hospital_id:
        rooms.append(f"hospital_{hospital_id}")
    if doctor_id:
        rooms.append(f"doctor_{doctor_id}")

    for room in rooms:
        await _post_to_pulseq_room(room, payload)

    logger.debug("LAB_ORDER_UPDATE HTTP notification dispatched for order %s (%s → %s)", order_id, old_status, new_status)
