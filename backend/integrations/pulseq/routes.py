"""REST endpoints consumed by PulseQ to create lab orders and fetch results.

Mounted at ``/integrations/pulseq/`` — only when ``INTEGRATION_MODE=pulseq_connected``.

All endpoints are authenticated via HMAC webhook signature (see auth.py).
PulseQ signs each request with the shared secret; the lab portal verifies
before processing.

Response format mirrors PulseQ's standardised envelope::

    {"success": true, "message": "...", "data": {...}}
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import db_models as m
from app.utils.responses import ok, fail

from integrations.pulseq.auth import verify_pulseq_webhook
from integrations.pulseq.schemas import (
    PulseQCatalogItem,
    PulseQLabOrderRequest,
    PulseQLabOrderResponse,
    PulseQLabResultResponse,
    PulseQOrderSummary,
    PulseQResultItem,
)
from integrations.pulseq.id_mapping import (
    HospitalMappingNotFoundError,
    get_lab_orders_by_pulseq_token,
    get_pulseq_patient_id,
    get_pulseq_token_id,
    resolve_doctor,
    resolve_hospital,
    resolve_or_create_patient,
    store_token_mapping,
)

logger = logging.getLogger("pulseq.integration.routes")

router = APIRouter(
    prefix="/integrations/pulseq",
    tags=["PulseQ Integration"],
    dependencies=[Depends(verify_pulseq_webhook)],
)


# ---------------------------------------------------------------------------
# POST /orders — PulseQ sends a lab order
# ---------------------------------------------------------------------------
@router.post("/orders")
def create_order(
    payload: PulseQLabOrderRequest,
    db: Session = Depends(get_db),
):
    """Create a lab order from a PulseQ consultation.

    - Verifies matching hospital exists in lab portal via ``resolve_hospital``
    - Resolves (or creates) a lab-portal patient ID from the PulseQ patient UUID
    - Resolves the ordering doctor
    - Looks up catalog tests by code
    - Creates a ``LabTestOrder`` with ``source='pulseq'``
    - Stores the token ↔ order mapping for later retrieval
    """
    # 0. Verify & resolve hospital ID
    try:
        lab_hospital_id = resolve_hospital(
            db,
            pulseq_hospital_id=payload.hospital_id,
        )
    except HospitalMappingNotFoundError as e:
        return fail(
            message=str(e),
            error_code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # 1. Resolve patient
    lab_patient_id = resolve_or_create_patient(
        db,
        pulseq_patient_id=payload.pulseq_patient_id,
        hospital_id=lab_hospital_id,
        patient_name=payload.patient_name,
        patient_phone=payload.patient_phone,
    )

    # 2. Resolve doctor
    lab_doctor_id = resolve_doctor(
        db,
        pulseq_doctor_id=payload.ordering_doctor_id or "",
        hospital_id=lab_hospital_id,
        doctor_name=payload.ordering_doctor_name,
    )

    # 3. Look up catalog tests by code
    catalog_tests = (
        db.query(m.LabTestCatalog)
        .filter(
            m.LabTestCatalog.hospital_id == lab_hospital_id,
            m.LabTestCatalog.code.in_(payload.test_codes),
            m.LabTestCatalog.is_active.is_(True),
            m.LabTestCatalog.is_deleted.is_(False),
        )
        .all()
    )

    if not catalog_tests:
        return fail(
            message=f"No active tests found for codes: {payload.test_codes}",
            error_code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    found_codes = {t.code for t in catalog_tests}
    missing_codes = set(payload.test_codes) - found_codes
    if missing_codes:
        logger.warning(
            "PulseQ order requested unknown test codes: %s", missing_codes
        )

    # 4. Determine sample type from first test
    sample_type = catalog_tests[0].sample_type if catalog_tests else None

    # 5. Create order
    test_ids = [t.id for t in catalog_tests]
    order = m.LabTestOrder(
        patient_id=lab_patient_id,
        patient_name=payload.patient_name,
        patient_age=payload.patient_age,
        patient_gender=payload.patient_gender,
        ordering_doctor_id=lab_doctor_id,
        ordering_doctor_name=payload.ordering_doctor_name,
        test_ids=json.dumps(test_ids),
        status="ordered",
        priority=payload.priority,
        sample_type=sample_type,
        source="pulseq",
        notes=payload.notes,
        hospital_id=lab_hospital_id,
    )
    db.add(order)
    db.flush()

    # 6. Create order items
    for test in catalog_tests:
        item = m.LabTestOrderItem(
            order_id=order.id,
            test_id=test.id,
            hospital_id=lab_hospital_id,
        )
        db.add(item)

    # 7. Store token mapping
    if payload.token_id:
        store_token_mapping(
            db,
            pulseq_token_id=payload.token_id,
            lab_order_id=order.id,
            hospital_id=lab_hospital_id,
        )

    db.commit()
    db.refresh(order)

    logger.info(
        "PulseQ lab order created: order=%s, patient=%s, tests=%d",
        order.id,
        payload.patient_name,
        len(catalog_tests),
    )

    response = PulseQLabOrderResponse(
        order_id=order.id,
        status=order.status,
        test_count=len(catalog_tests),
        source="pulseq",
        patient_name=payload.patient_name,
        hospital_id=lab_hospital_id,
        pulseq_token_id=payload.token_id,
    )

    return ok(
        data=response.model_dump(),
        message="Lab order created successfully",
    )


# ---------------------------------------------------------------------------
# GET /orders/{order_id}/results — fetch results for a specific order
# ---------------------------------------------------------------------------
@router.get("/orders/{order_id}/results")
def get_order_results(
    order_id: str,
    db: Session = Depends(get_db),
):
    """Return test results for a lab order.

    Includes both draft and verified results. PulseQ should look at the
    ``status`` field on each result to know if it's final.
    """
    order = (
        db.query(m.LabTestOrder)
        .filter(
            m.LabTestOrder.id == order_id,
            m.LabTestOrder.is_deleted.is_(False),
        )
        .first()
    )

    if not order:
        return fail(
            message="Order not found",
            error_code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    results = (
        db.query(m.LabTestResult)
        .filter(
            m.LabTestResult.order_id == order_id,
            m.LabTestResult.is_deleted.is_(False),
        )
        .all()
    )

    # Batch-fetch test names
    test_ids = list({r.test_id for r in results})
    tests_map: dict[str, m.LabTestCatalog] = {}
    if test_ids:
        for t in db.query(m.LabTestCatalog).filter(m.LabTestCatalog.id.in_(test_ids)).all():
            tests_map[t.id] = t

    result_items = []
    for r in results:
        test = tests_map.get(r.test_id)
        result_items.append(
            PulseQResultItem(
                result_id=r.id,
                test_id=r.test_id,
                test_name=test.name if test else None,
                test_code=test.code if test else None,
                result_values=_parse_json_safe(r.result_values) or [],
                abnormal_flag=r.abnormal_flag,
                status=r.status,
                verified_by=r.verified_by,
                verified_at=r.verified_at.isoformat() if r.verified_at else None,
                report_pdf_path=r.report_pdf_path,
            )
        )

    # Reverse-lookup PulseQ IDs
    pulseq_patient_id = get_pulseq_patient_id(
        db, lab_patient_id=order.patient_id, hospital_id=order.hospital_id
    )
    pulseq_token_id = get_pulseq_token_id(
        db, lab_order_id=order.id, hospital_id=order.hospital_id
    )

    response = PulseQLabResultResponse(
        order_id=order.id,
        order_status=order.status,
        patient_name=order.patient_name,
        patient_id=order.patient_id,
        pulseq_patient_id=pulseq_patient_id,
        pulseq_token_id=pulseq_token_id,
        results=[item.model_dump() for item in result_items],
    )

    return ok(data=response.model_dump())


# ---------------------------------------------------------------------------
# GET /orders/by-token/{token_id} — fetch orders linked to a PulseQ token
# ---------------------------------------------------------------------------
@router.get("/orders/by-token/{token_id}")
def get_orders_by_token(
    token_id: str,
    hospital_id: str,
    db: Session = Depends(get_db),
):
    """Return all lab orders linked to a PulseQ consultation token."""
    order_ids = get_lab_orders_by_pulseq_token(
        db, pulseq_token_id=token_id, hospital_id=hospital_id
    )

    if not order_ids:
        return ok(data=[], message="No lab orders found for this token")

    orders = (
        db.query(m.LabTestOrder)
        .filter(
            m.LabTestOrder.id.in_(order_ids),
            m.LabTestOrder.is_deleted.is_(False),
        )
        .order_by(m.LabTestOrder.created_at.desc())
        .all()
    )

    summaries = [_order_to_summary(db, o, pulseq_token_id=token_id) for o in orders]

    return ok(data=[s.model_dump() for s in summaries])


# ---------------------------------------------------------------------------
# GET /orders/by-patient/{patient_id} — fetch orders for a PulseQ patient
# ---------------------------------------------------------------------------
@router.get("/orders/by-patient/{patient_id}")
def get_orders_by_patient(
    patient_id: str,
    hospital_id: str,
    db: Session = Depends(get_db),
):
    """Return all lab orders for a given PulseQ patient ID."""
    from integrations.pulseq.id_mapping import PulseQIDMapping

    mapping = (
        db.query(PulseQIDMapping)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "patient",
            PulseQIDMapping.pulseq_id == patient_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )

    if not mapping:
        return ok(data=[], message="No lab orders found for this patient")

    orders = (
        db.query(m.LabTestOrder)
        .filter(
            m.LabTestOrder.patient_id == mapping.lab_entity_id,
            m.LabTestOrder.hospital_id == hospital_id,
            m.LabTestOrder.is_deleted.is_(False),
        )
        .order_by(m.LabTestOrder.created_at.desc())
        .all()
    )

    summaries = [_order_to_summary(db, o) for o in orders]

    return ok(data=[s.model_dump() for s in summaries])


# ---------------------------------------------------------------------------
# GET /catalog — list available tests
# ---------------------------------------------------------------------------
@router.get("/catalog")
def list_catalog(
    hospital_id: str,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    """Return the lab test catalog so PulseQ's doctor UI can show a test picker."""
    query = db.query(m.LabTestCatalog).filter(
        m.LabTestCatalog.hospital_id == hospital_id,
        m.LabTestCatalog.is_active.is_(True),
        m.LabTestCatalog.is_deleted.is_(False),
    )

    if category:
        query = query.filter(m.LabTestCatalog.category == category)

    tests = query.order_by(m.LabTestCatalog.name).all()

    items = [
        PulseQCatalogItem(
            test_id=t.id,
            name=t.name,
            code=t.code,
            category=t.category,
            sample_type=t.sample_type,
            price=float(t.price) if t.price else 0.0,
            turnaround_hours=t.turnaround_hours,
            is_active=t.is_active,
        ).model_dump()
        for t in tests
    ]

    return ok(data=items)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _order_to_summary(
    db: Session, order: m.LabTestOrder, pulseq_token_id: str | None = None
) -> PulseQOrderSummary:
    """Convert a ``LabTestOrder`` row into a ``PulseQOrderSummary``."""
    test_ids = _parse_json_safe(order.test_ids) or []

    if not pulseq_token_id:
        pulseq_token_id = get_pulseq_token_id(
            db, lab_order_id=order.id, hospital_id=order.hospital_id
        )

    return PulseQOrderSummary(
        order_id=order.id,
        patient_name=order.patient_name,
        ordering_doctor_name=order.ordering_doctor_name,
        status=order.status,
        priority=order.priority,
        test_count=len(test_ids) if isinstance(test_ids, list) else 0,
        source=order.source,
        created_at=order.created_at.isoformat() if order.created_at else None,
        pulseq_token_id=pulseq_token_id,
    )


def _parse_json_safe(value: Any) -> Any:
    """Parse a JSON column; return None on empty/invalid."""
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return None
