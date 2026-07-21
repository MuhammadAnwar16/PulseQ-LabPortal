"""Pydantic schemas for request/response validation (lab portal)."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# --- Auth ------------------------------------------------------------------ #
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict[str, Any]


# --- Catalog ---------------------------------------------------------------- #
class CatalogCreate(BaseModel):
    name: str
    code: str
    category: str
    sample_type: str
    price: float = 0
    turnaround_hours: int = 24
    reference_ranges: list[dict[str, Any]] | None = None
    is_active: bool = True


class CatalogUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    category: str | None = None
    sample_type: str | None = None
    price: float | None = None
    turnaround_hours: int | None = None
    reference_ranges: list[dict[str, Any]] | None = None
    is_active: bool | None = None


# --- Orders ----------------------------------------------------------------- #
class OrderCreate(BaseModel):
    patient_id: str
    patient_name: str
    patient_age: int | None = None
    patient_gender: str | None = None
    ordering_doctor_id: str | None = None
    ordering_doctor_name: str | None = None
    test_ids: list[str]
    priority: str = "routine"
    sample_type: str | None = None
    source: str = "internal"
    notes: str | None = None


class SampleCollectRequest(BaseModel):
    sample_barcode: str
    collected_by: str
    collected_at: str | None = None  # ISO; server default if omitted


class OrderAdvanceRequest(BaseModel):
    to_status: str | None = None  # optional explicit target


class OrderCancelRequest(BaseModel):
    reason: str | None = None


# --- Results ---------------------------------------------------------------- #
class ResultValueItem(BaseModel):
    param: str
    value: str | None = None
    unit: str | None = None
    low: float | None = None
    high: float | None = None
    abnormal: bool = False


class ResultSaveRequest(BaseModel):
    test_id: str
    result_values: list[ResultValueItem]
    abnormal_flag: str | None = None  # normal/abnormal/panic
    entered_by: str
    submit: bool = False  # True => submit for verification (stays draft until verify)


class ResultVerifyRequest(BaseModel):
    verified_by: str


# --- Inventory -------------------------------------------------------------- #
class InventoryCreate(BaseModel):
    name: str
    sku: str
    quantity: int = 0
    reorder_level: int = 0
    expiry_date: str | None = None
    unit_cost: float = 0
    category: str | None = None


class InventoryUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    quantity: int | None = None
    reorder_level: int | None = None
    expiry_date: str | None = None
    unit_cost: float | None = None
    category: str | None = None


# --- Invoices --------------------------------------------------------------- #
class InvoiceCreate(BaseModel):
    order_id: str
    amount: float = 0
    payment_method: str | None = None


class InvoicePaymentRequest(BaseModel):
    paid_amount: float
    payment_method: str | None = None


# --- Expenses --------------------------------------------------------------- #
class ExpenseCreate(BaseModel):
    category: str
    description: str | None = None
    amount: float = 0
    incurred_on: str | None = None


# --- Suppliers -------------------------------------------------------------- #
class SupplierCreate(BaseModel):
    name: str
    contact: str | None = None
    outstanding_balance: float = 0


class SupplierUpdate(BaseModel):
    name: str | None = None
    contact: str | None = None


class SupplierPaymentRequest(BaseModel):
    amount: float
    note: str | None = None


# --- Generic ---------------------------------------------------------------- #
class RestoreRequest(BaseModel):
    model: str  # catalog | order | inventory | invoice | supplier | expense


class MessageResponse(BaseModel):
    message: str
    id: str | None = None
