"""PulseQ ↔ Lab ID mapping table and resolution helpers.

PulseQ and the lab portal maintain separate databases. When PulseQ sends
a lab order referencing its own patient/doctor/hospital/token UUIDs, this module
creates a mapping row so the lab portal can track the relationships.

Supports mapping for:
- "hospital": Maps PulseQ hospital ID → Lab Portal hospital ID
- "patient": Maps PulseQ patient ID → Lab Portal patient ID
- "doctor": Maps PulseQ doctor ID → Lab Portal doctor ID
- "token": Maps PulseQ visit/token ID → Lab Portal order ID
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, func, Index
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.database import Base
from app import db_models as m


class HospitalMappingNotFoundError(Exception):
    """Raised when a PulseQ hospital_id cannot be resolved to a valid hospital in the Lab Portal."""

    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PulseQIDMapping(Base):
    """Links a PulseQ entity (hospital / patient / doctor / token) to a lab-portal entity."""

    __tablename__ = "pulseq_id_mappings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # "hospital" | "patient" | "doctor" | "token"
    pulseq_entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # The UUID from PulseQ's database
    pulseq_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # The corresponding ID in the lab portal (e.g. patient_id used on LabTestOrder)
    lab_entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # Multi-tenant scope
    hospital_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Optional metadata carried over from PulseQ
    pulseq_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pulseq_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index(
            "uq_pulseq_mapping",
            "pulseq_entity_type",
            "pulseq_id",
            "hospital_id",
            unique=True,
        ),
    )


# ---------------------------------------------------------------------------
# Resolution helpers
# ---------------------------------------------------------------------------

def resolve_hospital(
    db: Session,
    *,
    pulseq_hospital_id: str,
    lab_hospital_id: str | None = None,
    hospital_name: str | None = None,
) -> str:
    """Return the corresponding lab-portal hospital ID for a PulseQ hospital ID.

    Flow:
    1. If a mapping row already exists, verifies the mapped lab hospital exists in the lab portal.
    2. If no mapping row exists:
       - Checks whether a matching hospital exists in the lab portal's ``hospitals`` table.
       - If no match exists, raises ``HospitalMappingNotFoundError``.
       - Only creates a new mapping row once a valid lab hospital_id is confirmed.
    """
    existing = (
        db.query(PulseQIDMapping)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "hospital",
            PulseQIDMapping.pulseq_id == pulseq_hospital_id,
        )
        .first()
    )

    if existing:
        lab_hosp = (
            db.query(m.Hospital)
            .filter(m.Hospital.id == existing.lab_entity_id, m.Hospital.is_deleted.is_(False))
            .first()
        )
        if not lab_hosp:
            raise HospitalMappingNotFoundError(
                f"Mapped lab hospital '{existing.lab_entity_id}' for PulseQ hospital '{pulseq_hospital_id}' no longer exists in lab portal"
            )
        if hospital_name:
            existing.pulseq_name = hospital_name
            existing.updated_at = _utcnow()
            db.flush()
        return existing.lab_entity_id

    # No mapping row exists: determine candidate ID
    target_lab_id = lab_hospital_id or pulseq_hospital_id

    # Verify matching hospital actually exists in lab portal's hospitals table
    lab_hosp = (
        db.query(m.Hospital)
        .filter(m.Hospital.id == target_lab_id, m.Hospital.is_deleted.is_(False))
        .first()
    )
    if not lab_hosp:
        raise HospitalMappingNotFoundError(
            f"No valid hospital found in lab portal for hospital ID '{target_lab_id}' (PulseQ hospital ID: '{pulseq_hospital_id}')"
        )

    # Create mapping only once verified
    mapping = PulseQIDMapping(
        pulseq_entity_type="hospital",
        pulseq_id=pulseq_hospital_id,
        lab_entity_id=target_lab_id,
        hospital_id=target_lab_id,
        pulseq_name=hospital_name or getattr(lab_hosp, "name", None),
    )
    db.add(mapping)
    db.flush()
    return target_lab_id


def resolve_or_create_patient(
    db: Session,
    *,
    pulseq_patient_id: str,
    hospital_id: str,
    patient_name: str,
    patient_phone: str | None = None,
) -> str:
    """Return a stable lab-portal patient ID for the given PulseQ patient."""
    existing = (
        db.query(PulseQIDMapping)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "patient",
            PulseQIDMapping.pulseq_id == pulseq_patient_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )

    if existing:
        existing.pulseq_name = patient_name
        if patient_phone:
            existing.pulseq_phone = patient_phone
        existing.updated_at = _utcnow()
        db.flush()
        return existing.lab_entity_id

    lab_patient_id = str(uuid.uuid4())
    mapping = PulseQIDMapping(
        pulseq_entity_type="patient",
        pulseq_id=pulseq_patient_id,
        lab_entity_id=lab_patient_id,
        hospital_id=hospital_id,
        pulseq_name=patient_name,
        pulseq_phone=patient_phone,
    )
    db.add(mapping)
    db.flush()
    return lab_patient_id


def resolve_doctor(
    db: Session,
    *,
    pulseq_doctor_id: str,
    hospital_id: str,
    doctor_name: str | None = None,
) -> str | None:
    """Return a stable lab-portal doctor ID for the given PulseQ doctor."""
    if not pulseq_doctor_id:
        return None

    existing = (
        db.query(PulseQIDMapping)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "doctor",
            PulseQIDMapping.pulseq_id == pulseq_doctor_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )

    if existing:
        if doctor_name:
            existing.pulseq_name = doctor_name
            existing.updated_at = _utcnow()
            db.flush()
        return existing.lab_entity_id

    lab_doctor_id = str(uuid.uuid4())
    mapping = PulseQIDMapping(
        pulseq_entity_type="doctor",
        pulseq_id=pulseq_doctor_id,
        lab_entity_id=lab_doctor_id,
        hospital_id=hospital_id,
        pulseq_name=doctor_name,
    )
    db.add(mapping)
    db.flush()
    return lab_doctor_id


def store_token_mapping(
    db: Session,
    *,
    pulseq_token_id: str,
    lab_order_id: str,
    hospital_id: str,
) -> None:
    """Record the link between a PulseQ token (visit) and a lab order."""
    if not pulseq_token_id:
        return

    existing = (
        db.query(PulseQIDMapping)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "token",
            PulseQIDMapping.pulseq_id == pulseq_token_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )

    if existing:
        existing.lab_entity_id = lab_order_id
        existing.updated_at = _utcnow()
        db.flush()
        return

    mapping = PulseQIDMapping(
        pulseq_entity_type="token",
        pulseq_id=pulseq_token_id,
        lab_entity_id=lab_order_id,
        hospital_id=hospital_id,
    )
    db.add(mapping)
    db.flush()


def get_lab_orders_by_pulseq_token(
    db: Session, *, pulseq_token_id: str, hospital_id: str
) -> list[str]:
    """Return lab order IDs linked to a PulseQ token."""
    rows = (
        db.query(PulseQIDMapping.lab_entity_id)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "token",
            PulseQIDMapping.pulseq_id == pulseq_token_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .all()
    )
    return [r[0] for r in rows]


def get_pulseq_patient_id(
    db: Session, *, lab_patient_id: str, hospital_id: str
) -> str | None:
    """Reverse-lookup: lab patient ID → PulseQ patient ID."""
    row = (
        db.query(PulseQIDMapping.pulseq_id)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "patient",
            PulseQIDMapping.lab_entity_id == lab_patient_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )
    return row[0] if row else None


def get_pulseq_token_id(
    db: Session, *, lab_order_id: str, hospital_id: str
) -> str | None:
    """Reverse-lookup: lab order ID → PulseQ token ID."""
    row = (
        db.query(PulseQIDMapping.pulseq_id)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "token",
            PulseQIDMapping.lab_entity_id == lab_order_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )
    return row[0] if row else None


def get_lab_hospital_id(db: Session, *, pulseq_hospital_id: str) -> str:
    """Look up mapped lab hospital ID for a PulseQ hospital ID, falling back to pulseq_hospital_id."""
    row = (
        db.query(PulseQIDMapping.lab_entity_id)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "hospital",
            PulseQIDMapping.pulseq_id == pulseq_hospital_id,
        )
        .first()
    )
    return row[0] if row else pulseq_hospital_id
