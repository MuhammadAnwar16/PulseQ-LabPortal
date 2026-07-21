"""Laboratory portal business logic.

Mirrors the structure of pharmacy_inventory_service.py: pure functions over a
SQLAlchemy session, called by the route handlers. All queries are scoped by
hospital_id (multi-tenant) and exclude is_deleted rows.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import String, select
from sqlalchemy.orm import Session

from app import db_models as m
from app.security import TokenData
from app.realtime import broadcast_lab_event, notify_queue_update
from app.reporting import generate_result_report
import os
import logging

logger = logging.getLogger("pulseq.laboratory_service")

from app.schemas import (
    CatalogCreate,
    CatalogUpdate,
    ExpenseCreate,
    InventoryCreate,
    InventoryUpdate,
    InvoiceCreate,
    InvoicePaymentRequest,
    OrderAdvanceRequest,
    OrderCancelRequest,
    OrderCreate,
    ResultSaveRequest,
    ResultVerifyRequest,
    SampleCollectRequest,
    SupplierCreate,
    SupplierPaymentRequest,
    SupplierUpdate,
)

# Status lifecycle
STATUS_FLOW = ["ordered", "sample_collected", "processing", "completed", "reported"]
NEXT_STATUS = {
    "ordered": "sample_collected",
    "sample_collected": "processing",
    "processing": "completed",
    "completed": "reported",
}
TERMINAL = {"reported", "cancelled"}


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> Any:
    return _now().date()


def _active(q):
    return q.where(m.LabTestOrder.is_deleted.is_(False))


def _dump(obj) -> str:
    return json.dumps(obj, default=str)


def _notify(db: Session, order: m.LabTestOrder, event: str, extra: dict | None = None) -> None:
    notify_queue_update(
        order.hospital_id,
        order.ordering_doctor_id,
        event=event,
        order_id=order.id,
        status=order.status,
        extra=extra,
    )


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
def get_dashboard_summary(db: Session, hospital_id: str) -> dict:
    orders = (
        db.execute(
            select(m.LabTestOrder).where(
                m.LabTestOrder.hospital_id == hospital_id,
                m.LabTestOrder.is_deleted.is_(False),
            )
        )
        .scalars()
        .all()
    )
    today = _today()

    pending = sum(1 for o in orders if o.status in ("ordered", "sample_collected", "processing"))
    collected_today = sum(
        1 for o in orders if o.collected_at and o.collected_at.date() == today
    )
    in_processing = sum(1 for o in orders if o.status == "processing")
    completed_today = sum(
        1 for o in orders if o.status in ("completed", "reported") and o.updated_at.date() == today
    )

    low_stock = (
        db.execute(
            select(m.LabInventory).where(
                m.LabInventory.hospital_id == hospital_id,
                m.LabInventory.is_deleted.is_(False),
                m.LabInventory.quantity <= m.LabInventory.reorder_level,
            )
        )
        .scalars()
        .all()
    )

    invoices = (
        db.execute(
            select(m.LabInvoice).where(
                m.LabInvoice.hospital_id == hospital_id,
                m.LabInvoice.is_deleted.is_(False),
            )
        )
        .scalars()
        .all()
    )
    revenue_today = sum(
        float(i.paid_amount)
        for i in invoices
        if i.updated_at.date() == today
    )

    queue = sorted(orders, key=lambda o: o.created_at, reverse=True)[:10]

    return {
        "stats": {
            "pending_orders": pending,
            "samples_collected_today": collected_today,
            "in_processing": in_processing,
            "completed_today": completed_today,
            "low_stock_reagents": len(low_stock),
            "revenue_today": round(revenue_today, 2),
        },
        "queue": [_order_view(db, o) for o in queue],
        "low_stock": [i.to_dict() for i in low_stock],
    }


def _order_view(db: Session, o: m.LabTestOrder) -> dict:
    d = o.to_dict()
    ids = m._parse_json(o.test_ids) or []
    d["tests"] = _catalog_map(db, o.hospital_id, ids) if ids else []
    return d


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #
def list_orders(
    db: Session,
    hospital_id: str,
    *,
    status: str | None = None,
    priority: str | None = None,
    source: str | None = None,
    date: str | None = None,
    patient: str | None = None,
) -> list[dict]:
    q = select(m.LabTestOrder).where(
        m.LabTestOrder.hospital_id == hospital_id,
        m.LabTestOrder.is_deleted.is_(False),
    )
    if status:
        q = q.where(m.LabTestOrder.status == status)
    if priority:
        q = q.where(m.LabTestOrder.priority == priority)
    if source:
        q = q.where(m.LabTestOrder.source == source)
    if patient:
        q = q.where(m.LabTestOrder.patient_name.ilike(f"%{patient}%"))
    if date:
        q = q.where(m.LabTestOrder.created_at.cast(String).like(f"{date}%"))
    rows = db.execute(q.order_by(m.LabTestOrder.created_at.desc())).scalars().all()
    return [_order_view(db, o) for o in rows]


def get_order(db: Session, hospital_id: str, order_id: str) -> dict:
    o = _get_order_or_404(db, hospital_id, order_id)
    view = o.to_dict()
    view["tests"] = _catalog_map(db, hospital_id, m._parse_json(o.test_ids) or [])
    results = (
        db.execute(
            select(m.LabTestResult).where(
                m.LabTestResult.order_id == order_id,
                m.LabTestResult.is_deleted.is_(False),
            )
        )
        .scalars()
        .all()
    )
    view["results"] = [r.to_dict() for r in results]
    return view


def _catalog_map(db: Session, hospital_id: str, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    rows = (
        db.execute(
            select(m.LabTestCatalog).where(
                m.LabTestCatalog.hospital_id == hospital_id,
                m.LabTestCatalog.id.in_(ids),
                m.LabTestCatalog.is_deleted.is_(False),
            )
        )
        .scalars()
        .all()
    )
    return [c.to_dict() for c in rows]


def _get_order_or_404(db: Session, hospital_id: str, order_id: str) -> m.LabTestOrder:
    o = db.get(m.LabTestOrder, order_id)
    if not o or o.is_deleted or o.hospital_id != hospital_id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=404, detail="Order not found")
    return o


def create_order(db: Session, hospital_id: str, payload: OrderCreate, user: TokenData) -> dict:
    order = m.LabTestOrder(
        hospital_id=hospital_id,
        patient_id=payload.patient_id,
        patient_name=payload.patient_name,
        patient_age=payload.patient_age,
        patient_gender=payload.patient_gender,
        ordering_doctor_id=payload.ordering_doctor_id,
        ordering_doctor_name=payload.ordering_doctor_name,
        test_ids=_dump(payload.test_ids),
        status="ordered",
        priority=payload.priority,
        sample_type=payload.sample_type,
        source=payload.source,
        notes=payload.notes,
    )
    db.add(order)
    db.flush()
    # create order items
    for tid in payload.test_ids:
        db.add(m.LabTestOrderItem(hospital_id=hospital_id, order_id=order.id, test_id=tid))
    db.commit()
    db.refresh(order)
    _notify(db, order, "order_created")
    return _order_view(db, order)


def collect_sample(
    db: Session, hospital_id: str, order_id: str, payload: SampleCollectRequest
) -> dict:
    o = _get_order_or_404(db, hospital_id, order_id)
    if o.status not in ("ordered",):
        from fastapi import HTTPException, status

        raise HTTPException(status_code=400, detail="Sample already collected or order not collectable")
    o.sample_barcode = payload.sample_barcode
    o.collected_by = payload.collected_by
    o.collected_at = (
        datetime.fromisoformat(payload.collected_at) if payload.collected_at else _now()
    )
    o.status = "sample_collected"
    db.commit()
    db.refresh(o)
    _notify(db, o, "sample_collected")
    return _order_view(db, o)


def advance_order(
    db: Session, hospital_id: str, order_id: str, payload: OrderAdvanceRequest
) -> dict:
    o = _get_order_or_404(db, hospital_id, order_id)
    target = payload.to_status or NEXT_STATUS.get(o.status)
    if target is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=400, detail=f"Cannot advance from '{o.status}'")
    if target not in STATUS_FLOW:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=400, detail=f"Invalid status '{target}'")
    o.status = target
    db.commit()
    db.refresh(o)
    _notify(db, o, "status_advanced")
    return _order_view(db, o)


def cancel_order(
    db: Session, hospital_id: str, order_id: str, payload: OrderCancelRequest
) -> dict:
    o = _get_order_or_404(db, hospital_id, order_id)
    if o.status in TERMINAL:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=400, detail="Order is already final")
    o.status = "cancelled"
    if payload.reason:
        o.notes = (o.notes or "") + f"\n[cancelled] {payload.reason}"
    db.commit()
    db.refresh(o)
    _notify(db, o, "order_cancelled")
    return _order_view(db, o)


# --------------------------------------------------------------------------- #
# Results
# --------------------------------------------------------------------------- #
def save_result(
    db: Session, hospital_id: str, order_id: str, payload: ResultSaveRequest
) -> dict:
    o = _get_order_or_404(db, hospital_id, order_id)
    # one result row per test; update if exists, else create
    existing = db.execute(
        select(m.LabTestResult).where(
            m.LabTestResult.order_id == order_id,
            m.LabTestResult.test_id == payload.test_id,
            m.LabTestResult.is_deleted.is_(False),
        )
    ).scalar_one_or_none()

    values = [v.model_dump() for v in payload.result_values]
    abnormal = any(v.get("abnormal") for v in values)
    flag = payload.abnormal_flag or ("abnormal" if abnormal else "normal")

    # A result is NEVER auto-verified here. Saving (draft or "submit for
    # verification") leaves it as "draft"; only verify_result() promotes it to
    # "verified" and generates the PDF. Previously submit=True set status
    # "verified" directly, which hid the verification step's "Verify & Finalise"
    # button, so the report PDF was never generated and the order never reached
    # the Reports list. When a result is submitted we move the order into
    # "processing" so it surfaces as work-in-progress awaiting sign-off.
    status_value = "draft"

    if existing:
        existing.result_values = _dump(values)
        existing.abnormal_flag = flag
        existing.entered_by = payload.entered_by
        existing.status = status_value
        result = existing
    else:
        result = m.LabTestResult(
            hospital_id=hospital_id,
            order_id=order_id,
            test_id=payload.test_id,
            result_values=_dump(values),
            abnormal_flag=flag,
            entered_by=payload.entered_by,
            status=status_value,
        )
        db.add(result)
    if payload.submit and o.status in ("ordered", "sample_collected"):
        o.status = "processing"
    db.commit()
    db.refresh(result)
    _notify(db, o, "result_saved", extra={"test_id": payload.test_id})
    return result.to_dict()


def verify_result(
    db: Session, hospital_id: str, order_id: str, result_id: str, payload: ResultVerifyRequest
) -> dict:
    o = _get_order_or_404(db, hospital_id, order_id)
    result = db.get(m.LabTestResult, result_id)
    if not result or result.is_deleted or result.order_id != order_id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=404, detail="Result not found")

    # verify every result on the order (second sign-off finalises the report)
    results = (
        db.execute(
            select(m.LabTestResult).where(
                m.LabTestResult.order_id == order_id,
                m.LabTestResult.is_deleted.is_(False),
            )
        )
        .scalars()
        .all()
    )
    catalog = {c["id"]: c for c in _catalog_map(db, hospital_id, [r.test_id for r in results])}
    for r in results:
        r.status = "verified"
        r.verified_by = payload.verified_by
        r.verified_at = _now()
    # generate a single combined PDF report for the order
    local_path = generate_result_report(o.to_dict(), [r.to_dict() for r in results], catalog)
    path = local_path

    # Attempt to upload to Cloudflare R2 via storage_service
    try:
        from app.services.storage_service import upload_bytes
        with open(local_path, "rb") as f:
            pdf_bytes = f.read()
        filename = os.path.basename(local_path)
        r2_key = f"lab_reports/{hospital_id}/{order_id}/{filename}"
        r2_url = upload_bytes(r2_key, pdf_bytes, "application/pdf")
        path = r2_url
    except Exception as e:
        logger.warning(f"Failed to upload report to R2, using local path fallback: {e}")

    for r in results:
        r.report_pdf_path = local_path

    o.status = "reported"
    db.commit()
    db.refresh(result)
    _notify(db, o, "result_verified", extra={"report_pdf_path": local_path})
    return result.to_dict()


# --------------------------------------------------------------------------- #
# Catalog
# --------------------------------------------------------------------------- #
def list_catalog(db: Session, hospital_id: str, include_inactive: bool = False) -> list[dict]:
    q = select(m.LabTestCatalog).where(
        m.LabTestCatalog.hospital_id == hospital_id,
        m.LabTestCatalog.is_deleted.is_(False),
    )
    if not include_inactive:
        q = q.where(m.LabTestCatalog.is_active.is_(True))
    rows = db.execute(q.order_by(m.LabTestCatalog.name)).scalars().all()
    return [c.to_dict() for c in rows]


def create_catalog(db: Session, hospital_id: str, payload: CatalogCreate) -> dict:
    c = m.LabTestCatalog(
        hospital_id=hospital_id,
        name=payload.name,
        code=payload.code,
        category=payload.category,
        sample_type=payload.sample_type,
        price=payload.price,
        turnaround_hours=payload.turnaround_hours,
        reference_ranges=_dump(payload.reference_ranges) if payload.reference_ranges else None,
        is_active=payload.is_active,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    data = c.to_dict()
    broadcast_lab_event(hospital_id, "lab_catalog_updated", data)
    return data


def update_catalog(db: Session, hospital_id: str, catalog_id: str, payload: CatalogUpdate) -> dict:
    c = _get_or_404(db, m.LabTestCatalog, hospital_id, catalog_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        if field == "reference_ranges" and val is not None:
            setattr(c, field, _dump(val))
        elif val is not None:
            setattr(c, field, val)
    db.commit()
    db.refresh(c)
    data = c.to_dict()
    broadcast_lab_event(hospital_id, "lab_catalog_updated", data)
    return data


def delete_catalog(db: Session, hospital_id: str, catalog_id: str) -> None:
    c = _get_or_404(db, m.LabTestCatalog, hospital_id, catalog_id)
    c.is_deleted = True
    db.commit()
    broadcast_lab_event(hospital_id, "lab_catalog_updated", {"id": catalog_id, "is_deleted": True})


# --------------------------------------------------------------------------- #
# Inventory
# --------------------------------------------------------------------------- #
def list_inventory(db: Session, hospital_id: str) -> list[dict]:
    rows = db.execute(
        select(m.LabInventory).where(
            m.LabInventory.hospital_id == hospital_id,
            m.LabInventory.is_deleted.is_(False),
        ).order_by(m.LabInventory.name)
    ).scalars().all()
    return [i.to_dict() for i in rows]


def create_inventory(db: Session, hospital_id: str, payload: InventoryCreate) -> dict:
    i = m.LabInventory(hospital_id=hospital_id, **payload.model_dump())
    db.add(i)
    db.commit()
    db.refresh(i)
    data = i.to_dict()
    broadcast_lab_event(hospital_id, "lab_inventory_updated", data)
    return data


def update_inventory(db: Session, hospital_id: str, item_id: str, payload: InventoryUpdate) -> dict:
    i = _get_or_404(db, m.LabInventory, hospital_id, item_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        if val is not None:
            setattr(i, field, val)
    db.commit()
    db.refresh(i)
    data = i.to_dict()
    broadcast_lab_event(hospital_id, "lab_inventory_updated", data)
    return data


def delete_inventory(db: Session, hospital_id: str, item_id: str) -> None:
    i = _get_or_404(db, m.LabInventory, hospital_id, item_id)
    i.is_deleted = True
    db.commit()
    broadcast_lab_event(hospital_id, "lab_inventory_updated", {"id": item_id, "is_deleted": True})


# --------------------------------------------------------------------------- #
# Invoices
# --------------------------------------------------------------------------- #
def list_invoices(db: Session, hospital_id: str) -> list[dict]:
    rows = db.execute(
        select(m.LabInvoice).where(
            m.LabInvoice.hospital_id == hospital_id,
            m.LabInvoice.is_deleted.is_(False),
        ).order_by(m.LabInvoice.created_at.desc())
    ).scalars().all()
    return [i.to_dict() for i in rows]


def create_invoice(db: Session, hospital_id: str, payload: InvoiceCreate) -> dict:
    inv = m.LabInvoice(
        hospital_id=hospital_id,
        order_id=payload.order_id,
        amount=payload.amount,
        paid_amount=0,
        status="unpaid",
        payment_method=payload.payment_method,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    data = inv.to_dict()
    broadcast_lab_event(hospital_id, "lab_invoice_updated", data)
    return data


def record_invoice_payment(
    db: Session, hospital_id: str, invoice_id: str, payload: InvoicePaymentRequest
) -> dict:
    inv = _get_or_404(db, m.LabInvoice, hospital_id, invoice_id)
    inv.paid_amount = float(inv.paid_amount) + float(payload.paid_amount)
    if payload.payment_method:
        inv.payment_method = payload.payment_method
    inv.status = "paid" if float(inv.paid_amount) >= float(inv.amount) else "partial"
    db.commit()
    db.refresh(inv)
    data = inv.to_dict()
    broadcast_lab_event(hospital_id, "lab_invoice_updated", data)
    return data


def delete_invoice(db: Session, hospital_id: str, invoice_id: str) -> None:
    inv = _get_or_404(db, m.LabInvoice, hospital_id, invoice_id)
    inv.is_deleted = True
    db.commit()
    broadcast_lab_event(hospital_id, "lab_invoice_updated", {"id": invoice_id, "is_deleted": True})


# --------------------------------------------------------------------------- #
# Expenses
# --------------------------------------------------------------------------- #
def list_expenses(db: Session, hospital_id: str) -> list[dict]:
    rows = db.execute(
        select(m.LabExpense).where(
            m.LabExpense.hospital_id == hospital_id,
            m.LabExpense.is_deleted.is_(False),
        ).order_by(m.LabExpense.created_at.desc())
    ).scalars().all()
    return [e.to_dict() for e in rows]


def create_expense(db: Session, hospital_id: str, payload: ExpenseCreate) -> dict:
    e = m.LabExpense(hospital_id=hospital_id, **payload.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    data = e.to_dict()
    broadcast_lab_event(hospital_id, "lab_expense_updated", data)
    return data


def delete_expense(db: Session, hospital_id: str, expense_id: str) -> None:
    e = _get_or_404(db, m.LabExpense, hospital_id, expense_id)
    e.is_deleted = True
    db.commit()
    broadcast_lab_event(hospital_id, "lab_expense_updated", {"id": expense_id, "is_deleted": True})


# --------------------------------------------------------------------------- #
# Suppliers (reagent/kit vendors) + credit
# --------------------------------------------------------------------------- #
def list_suppliers(db: Session, hospital_id: str) -> list[dict]:
    rows = db.execute(
        select(m.LabSupplier).where(
            m.LabSupplier.hospital_id == hospital_id,
            m.LabSupplier.is_deleted.is_(False),
        ).order_by(m.LabSupplier.name)
    ).scalars().all()
    return [s.to_dict() for s in rows]


def create_supplier(db: Session, hospital_id: str, payload: SupplierCreate) -> dict:
    s = m.LabSupplier(hospital_id=hospital_id, **payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    data = s.to_dict()
    broadcast_lab_event(hospital_id, "lab_supplier_updated", data)
    return data


def update_supplier(db: Session, hospital_id: str, supplier_id: str, payload: SupplierUpdate) -> dict:
    s = _get_or_404(db, m.LabSupplier, hospital_id, supplier_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        if val is not None:
            setattr(s, field, val)
    db.commit()
    db.refresh(s)
    data = s.to_dict()
    broadcast_lab_event(hospital_id, "lab_supplier_updated", data)
    return data


def pay_supplier(db: Session, hospital_id: str, supplier_id: str, payload: SupplierPaymentRequest) -> dict:
    s = _get_or_404(db, m.LabSupplier, hospital_id, supplier_id)
    s.outstanding_balance = max(0.0, float(s.outstanding_balance) - float(payload.amount))
    db.commit()
    db.refresh(s)
    data = s.to_dict()
    broadcast_lab_event(hospital_id, "lab_supplier_updated", data)
    return data


def delete_supplier(db: Session, hospital_id: str, supplier_id: str) -> None:
    s = _get_or_404(db, m.LabSupplier, hospital_id, supplier_id)
    s.is_deleted = True
    db.commit()
    broadcast_lab_event(hospital_id, "lab_supplier_updated", {"id": supplier_id, "is_deleted": True})


# --------------------------------------------------------------------------- #
# Trash (soft-deleted) + restore
# --------------------------------------------------------------------------- #
_TRASH_MODELS = {
    "catalog": m.LabTestCatalog,
    "order": m.LabTestOrder,
    "inventory": m.LabInventory,
    "invoice": m.LabInvoice,
    "supplier": m.LabSupplier,
    "expense": m.LabExpense,
}


def list_trash(db: Session, hospital_id: str) -> dict:
    out: dict[str, list[dict]] = {}
    for name, model in _TRASH_MODELS.items():
        rows = db.execute(
            select(model).where(
                model.hospital_id == hospital_id,
                model.is_deleted.is_(True),
            )
        ).scalars().all()
        out[name] = [r.to_dict() for r in rows]
    return out


def restore(db: Session, hospital_id: str, model: str, item_id: str) -> dict:
    if model not in _TRASH_MODELS:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=400, detail=f"Unknown trash model '{model}'")
    row = db.get(_TRASH_MODELS[model], item_id)
    if not row or row.hospital_id != hospital_id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=404, detail="Item not found")
    row.is_deleted = False
    db.commit()
    db.refresh(row)
    data = row.to_dict()
    broadcast_lab_event(hospital_id, "lab_trash_updated", {"model": model, "item": data})
    return data


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #
def list_reports(db: Session, hospital_id: str) -> list[dict]:
    rows = db.execute(
        select(m.LabTestOrder).where(
            m.LabTestOrder.hospital_id == hospital_id,
            m.LabTestOrder.is_deleted.is_(False),
            m.LabTestOrder.status.in_(["completed", "reported"]),
        ).order_by(m.LabTestOrder.updated_at.desc())
    ).scalars().all()
    return [_order_view(db, o) for o in rows]


def report_pdf_path(db: Session, hospital_id: str, order_id: str) -> str | None:
    o = _get_order_or_404(db, hospital_id, order_id)
    results = (
        db.execute(
            select(m.LabTestResult).where(
                m.LabTestResult.order_id == order_id,
                m.LabTestResult.is_deleted.is_(False),
            )
        )
        .scalars()
        .all()
    )
    for r in results:
        if r.report_pdf_path and not r.report_pdf_path.startswith("http") and os.path.exists(r.report_pdf_path):
            return r.report_pdf_path

    # Fallback to generating the report on the fly
    try:
        from app.reporting import generate_result_report
        order_dict = _order_view(db, o)
        tests = order_dict.get("tests") or []
        catalog = {c["id"]: c for c in tests} if tests else {}
        results_dicts = [r.to_dict() for r in results] if results else []

        if not results_dicts and tests:
            for t in tests:
                ref_ranges = t.get("reference_ranges") or []
                res_vals = []
                for rr in ref_ranges:
                    res_vals.append({
                        "param": rr.get("param", "Result"),
                        "value": "Pending",
                        "unit": rr.get("unit"),
                        "low": rr.get("low"),
                        "high": rr.get("high"),
                    })
                if not res_vals:
                    res_vals.append({"param": t.get("name", "Test"), "value": "Pending", "unit": ""})
                results_dicts.append({
                    "test_id": t["id"],
                    "result_values": res_vals,
                    "status": "draft"
                })

        local_path = generate_result_report(order_dict, results_dicts, catalog)
        for r in results:
            r.report_pdf_path = local_path
        if results:
            db.commit()
        return local_path
    except Exception as e:
        logger.error(f"Error generating PDF report for order {order_id}: {e}")
        return None


# --------------------------------------------------------------------------- #
# shared get-or-404
# --------------------------------------------------------------------------- #
def _get_or_404(db: Session, model, hospital_id: str, item_id: str):
    row = db.get(model, item_id)
    if not row or row.is_deleted or row.hospital_id != hospital_id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=404, detail="Not found")
    return row
