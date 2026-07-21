"""Pydantic schemas for the PulseQ integration API contract.

These define the shape of data PulseQ sends to the lab portal and the shape
of data the lab portal returns.  They are intentionally separate from the
lab portal's internal schemas (app.schemas) to keep the integration boundary
explicit.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Inbound: PulseQ → Lab Portal
# ---------------------------------------------------------------------------
class PulseQLabOrderRequest(BaseModel):
    """Payload PulseQ sends when a doctor orders lab tests during a consultation."""

    pulseq_patient_id: str = Field(
        ..., description="Patient UUID from PulseQ's users table"
    )
    patient_name: str = Field(..., min_length=1, max_length=200)
    patient_age: int | None = None
    patient_gender: str | None = None
    patient_phone: str | None = None

    ordering_doctor_id: str | None = Field(
        None, description="Doctor UUID from PulseQ's doctors table"
    )
    ordering_doctor_name: str | None = None

    hospital_id: str = Field(
        ..., description="Shared hospital UUID (must match across both systems)"
    )
    token_id: str | None = Field(
        None,
        description="PulseQ token/visit ID — links the order back to a consultation",
    )

    test_codes: list[str] = Field(
        ...,
        min_length=1,
        description="Lab catalog codes (e.g. ['CBC', 'LFT'])",
    )
    priority: str = "routine"
    notes: str | None = None


# ---------------------------------------------------------------------------
# Outbound: Lab Portal → PulseQ
# ---------------------------------------------------------------------------
class PulseQLabOrderResponse(BaseModel):
    """Returned to PulseQ after a lab order is successfully created."""

    order_id: str
    status: str
    test_count: int
    source: str = "pulseq"
    patient_name: str
    hospital_id: str
    pulseq_token_id: str | None = None


class PulseQResultItem(BaseModel):
    """A single test result within an order — matches lab_test_results shape."""

    result_id: str
    test_id: str
    test_name: str | None = None
    test_code: str | None = None
    result_values: list[dict[str, Any]] = []
    abnormal_flag: str | None = None
    status: str  # draft | verified
    verified_by: str | None = None
    verified_at: str | None = None
    report_pdf_path: str | None = None


class PulseQLabResultResponse(BaseModel):
    """Full result payload returned when PulseQ fetches results for an order."""

    order_id: str
    order_status: str
    patient_name: str
    patient_id: str
    pulseq_patient_id: str | None = None
    pulseq_token_id: str | None = None
    results: list[PulseQResultItem] = []


class PulseQCatalogItem(BaseModel):
    """Single test from the lab catalog — returned in the catalog listing."""

    test_id: str
    name: str
    code: str
    category: str
    sample_type: str
    price: float
    turnaround_hours: int
    is_active: bool


class PulseQOrderSummary(BaseModel):
    """Abbreviated order info for listing endpoints."""

    order_id: str
    patient_name: str
    ordering_doctor_name: str | None = None
    status: str
    priority: str
    test_count: int
    source: str
    created_at: str | None = None
    pulseq_token_id: str | None = None
