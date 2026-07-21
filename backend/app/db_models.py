"""SQLAlchemy 2-style models for the Laboratory portal (and shared auth/tenant).

Conventions (mirrored across every model in PulseQ):
  - id: String PK, uuid4
  - hospital_id: FK to Hospital (multi-tenant scoping, every row)
  - is_deleted: soft delete flag (never hard-delete)
  - created_at / updated_at: server-defaulted timestamps
  - to_dict(): serialise a row (honours is_deleted)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Timestamped:
    """Mixin carrying the shared columns every PulseQ model needs."""

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    hospital_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hospitals.id"), index=True, nullable=False
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def to_dict(self) -> dict:  # pragma: no cover - overridden by subclasses
        return {
            "id": self.id,
            "hospital_id": self.hospital_id,
            "is_deleted": self.is_deleted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# --------------------------------------------------------------------------- #
# Tenant + Auth (shared, required for multi-tenancy and require_roles)
# --------------------------------------------------------------------------- #
class Hospital(Base, Timestamped):
    __tablename__ = "hospitals"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(name=self.name, slug=self.slug, is_active=self.is_active)
        return d


# Roles recognised across the whole app. "laboratory" is added for this portal.
VALID_ROLES = ("admin", "doctor", "reception", "pharmacy", "laboratory", "patient")


class User(Base, Timestamped):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)  # one of VALID_ROLES
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def to_dict(self, include_password: bool = False) -> dict:
        d = super().to_dict()
        d.update(
            username=self.username,
            full_name=self.full_name,
            role=self.role,
            is_active=self.is_active,
        )
        if include_password:
            d["hashed_password"] = self.hashed_password
        return d


# --------------------------------------------------------------------------- #
# Laboratory domain models
# --------------------------------------------------------------------------- #
class LabTestCatalog(Base, Timestamped):
    """Master list of tests the lab offers."""

    __tablename__ = "lab_test_catalog"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)  # hematology, biochemistry...
    sample_type: Mapped[str] = mapped_column(String(60), nullable=False)  # blood, urine, swab...
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    turnaround_hours: Mapped[int] = mapped_column(default=24, nullable=False)
    # reference_ranges: JSON of parameter name -> {unit, low, high, text}
    reference_ranges: Mapped[dict | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(
            name=self.name,
            code=self.code,
            category=self.category,
            sample_type=self.sample_type,
            price=float(self.price) if self.price is not None else 0.0,
            turnaround_hours=self.turnaround_hours,
            reference_ranges=_parse_json(self.reference_ranges),
            is_active=self.is_active,
        )
        return d


class LabTestOrder(Base, Timestamped):
    """A patient's request for one or more tests. Lifecycle:

    ordered -> sample_collected -> processing -> completed -> reported -> cancelled
    """

    __tablename__ = "lab_test_orders"

    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    patient_name: Mapped[str] = mapped_column(String(200), nullable=False)
    patient_age: Mapped[int | None] = mapped_column(nullable=True)
    patient_gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ordering_doctor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    ordering_doctor_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # test_ids: JSON array of catalog ids bundled into this order
    test_ids: Mapped[list | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="ordered", nullable=False, index=True)
    priority: Mapped[str] = mapped_column(String(20), default="routine", nullable=False)
    sample_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    sample_barcode: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    collected_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="internal", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list["LabTestOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    results: Mapped[list["LabTestResult"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(
            patient_id=self.patient_id,
            patient_name=self.patient_name,
            patient_age=self.patient_age,
            patient_gender=self.patient_gender,
            ordering_doctor_id=self.ordering_doctor_id,
            ordering_doctor_name=self.ordering_doctor_name,
            test_ids=_parse_json(self.test_ids) or [],
            status=self.status,
            priority=self.priority,
            sample_type=self.sample_type,
            sample_barcode=self.sample_barcode,
            collected_at=self.collected_at.isoformat() if self.collected_at else None,
            collected_by=self.collected_by,
            source=self.source,
            notes=self.notes,
        )
        return d


class LabTestOrderItem(Base, Timestamped):
    """Join table: an order can bundle multiple catalog tests."""

    __tablename__ = "lab_test_order_items"

    order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lab_test_orders.id"), nullable=False, index=True
    )
    test_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lab_test_catalog.id"), nullable=False, index=True
    )

    order: Mapped["LabTestOrder"] = relationship(back_populates="items")
    test: Mapped["LabTestCatalog"] = relationship()

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(order_id=self.order_id, test_id=self.test_id)
        return d


class LabTestResult(Base, Timestamped):
    """Entered result values for one test within an order."""

    __tablename__ = "lab_test_results"

    order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lab_test_orders.id"), nullable=False, index=True
    )
    test_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lab_test_catalog.id"), nullable=False, index=True
    )
    # result_values: JSON list of {param, value, unit, low, high, abnormal}
    result_values: Mapped[list | None] = mapped_column(Text, nullable=True)
    abnormal_flag: Mapped[str | None] = mapped_column(String(20), nullable=True)  # normal/abnormal/panic
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)  # draft/verified
    entered_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    report_pdf_path: Mapped[str | None] = mapped_column(String(400), nullable=True)

    order: Mapped["LabTestOrder"] = relationship(back_populates="results")
    test: Mapped["LabTestCatalog"] = relationship()

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(
            order_id=self.order_id,
            test_id=self.test_id,
            result_values=_parse_json(self.result_values) or [],
            abnormal_flag=self.abnormal_flag,
            status=self.status,
            entered_by=self.entered_by,
            verified_by=self.verified_by,
            verified_at=self.verified_at.isoformat() if self.verified_at else None,
            report_pdf_path=self.report_pdf_path,
        )
        return d


class LabInventory(Base, Timestamped):
    """Reagents / kits / consumables (mirrors PharmacyMedicine)."""

    __tablename__ = "lab_inventory"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sku: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    reorder_level: Mapped[int] = mapped_column(default=0, nullable=False)
    expiry_date: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ISO date
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(
            name=self.name,
            sku=self.sku,
            quantity=self.quantity,
            reorder_level=self.reorder_level,
            expiry_date=self.expiry_date,
            unit_cost=float(self.unit_cost) if self.unit_cost is not None else 0.0,
            category=self.category,
        )
        return d


class LabInvoice(Base, Timestamped):
    """Billing for a lab order (mirrors PharmacyInvoice)."""

    __tablename__ = "lab_invoices"

    order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lab_test_orders.id"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="unpaid", nullable=False)  # unpaid/paid/partial
    payment_method: Mapped[str | None] = mapped_column(String(40), nullable=True)

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(
            order_id=self.order_id,
            amount=float(self.amount) if self.amount is not None else 0.0,
            paid_amount=float(self.paid_amount) if self.paid_amount is not None else 0.0,
            status=self.status,
            payment_method=self.payment_method,
        )
        return d


class LabSupplier(Base, Timestamped):
    """Reagent / kit vendors (mirrors PharmacyDistributor)."""

    __tablename__ = "lab_suppliers"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact: Mapped[str | None] = mapped_column(String(200), nullable=True)
    outstanding_balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(
            name=self.name,
            contact=self.contact,
            outstanding_balance=float(self.outstanding_balance)
            if self.outstanding_balance is not None
            else 0.0,
        )
        return d


class LabExpense(Base, Timestamped):
    """Lab operating expenses (mirrors pharmacy expense model)."""

    __tablename__ = "lab_expenses"

    category: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    incurred_on: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ISO date

    def to_dict(self) -> dict:
        d = super().to_dict()
        d.update(
            category=self.category,
            description=self.description,
            amount=float(self.amount) if self.amount is not None else 0.0,
            incurred_on=self.incurred_on,
        )
        return d


def _parse_json(value):
    """Safely parse a JSON column; return None on empty/invalid."""
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        import json

        return json.loads(value)
    except (ValueError, TypeError):
        return None
