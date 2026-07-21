"""Lifecycle hooks that the lab portal's service layer calls after key events.

These hooks bridge the lab portal's internal event flow to the PulseQ
integration — emitting outbound WebSocket events and performing any
cross-system bookkeeping when results are verified or order status changes.

The hooks are no-ops when the integration is not active.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy.orm import Session

from integrations.pulseq.config import integration_settings
from integrations.pulseq import id_mapping

logger = logging.getLogger("pulseq.integration.hooks")


def on_result_verified(
    db: Session,
    *,
    order: Any,
    results: list[Any],
    test_names: list[str] | None = None,
) -> None:
    """Called after the lab service verifies a result.

    Triggers a ``LAB_RESULT_READY`` event to PulseQ's WebSocket rooms so the
    doctor/patient portals can show a notification.

    Designed to be called from synchronous code (the lab service); it schedules
    the async event emission on the running event loop.
    """
    if not integration_settings.is_active:
        return

    # Only emit for orders originating from PulseQ
    if getattr(order, "source", None) != "pulseq":
        return

    hospital_id = order.hospital_id
    doctor_id = order.ordering_doctor_id

    # Reverse-lookup the PulseQ token and patient IDs
    pulseq_token_id = id_mapping.get_pulseq_token_id(
        db, lab_order_id=order.id, hospital_id=hospital_id
    )
    pulseq_patient_id = id_mapping.get_pulseq_patient_id(
        db, lab_patient_id=order.patient_id, hospital_id=hospital_id
    )

    # Gather abnormal flags
    abnormal_flags = []
    for r in results:
        flag = getattr(r, "abnormal_flag", None)
        if flag:
            abnormal_flags.append(flag)

    has_report = any(getattr(r, "report_pdf_path", None) for r in results)

    async def _emit():
        from integrations.pulseq.events import emit_result_ready

        await emit_result_ready(
            hospital_id=hospital_id,
            doctor_id=doctor_id,
            order_id=order.id,
            patient_id=pulseq_patient_id,
            patient_name=order.patient_name,
            pulseq_token_id=pulseq_token_id,
            test_names=test_names or [],
            status=order.status,
            abnormal_flags=abnormal_flags,
            report_available=has_report,
        )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_emit())
        else:
            loop.run_until_complete(_emit())
    except RuntimeError:
        logger.debug("No event loop available; skipping LAB_RESULT_READY emission")


def on_order_status_change(
    db: Session,
    *,
    order: Any,
    old_status: str,
    new_status: str,
) -> None:
    """Called when an order transitions between lifecycle states.

    Emits a ``LAB_ORDER_UPDATE`` event to PulseQ's WebSocket rooms.
    """
    if not integration_settings.is_active:
        return

    if getattr(order, "source", None) != "pulseq":
        return

    hospital_id = order.hospital_id
    doctor_id = order.ordering_doctor_id

    pulseq_token_id = id_mapping.get_pulseq_token_id(
        db, lab_order_id=order.id, hospital_id=hospital_id
    )

    async def _emit():
        from integrations.pulseq.events import emit_order_status_change

        await emit_order_status_change(
            hospital_id=hospital_id,
            doctor_id=doctor_id,
            order_id=order.id,
            old_status=old_status,
            new_status=new_status,
            pulseq_token_id=pulseq_token_id,
        )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_emit())
        else:
            loop.run_until_complete(_emit())
    except RuntimeError:
        logger.debug("No event loop available; skipping LAB_ORDER_UPDATE emission")
