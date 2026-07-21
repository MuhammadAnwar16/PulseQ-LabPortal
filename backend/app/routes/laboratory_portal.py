"""Laboratory portal REST + realtime routes.

Mounted in main.py at /api/v1/staff/laboratory. Every endpoint is guarded by
require_roles("laboratory", "admin") — kept separate from any future
read-only doctor endpoint (which would need its own require_roles check).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.security import TokenData, require_roles
from app.database import get_db
from app.realtime import router as realtime_router
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
from app.services import laboratory_service as svc
from app.utils.responses import ok, fail

router = APIRouter(prefix="/staff/laboratory", tags=["laboratory"])
router.include_router(realtime_router)


@router.get("/dashboard/summary")
def dashboard_summary(
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.get_dashboard_summary(db, user.hospital_id))


# --- Orders ---------------------------------------------------------------- #
@router.get("/orders")
def orders_list(
    status: str | None = Query(None),
    priority: str | None = Query(None),
    source: str | None = Query(None),
    date: str | None = Query(None),
    patient: str | None = Query(None),
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.list_orders(
        db, user.hospital_id, status=status, priority=priority, source=source, date=date, patient=patient
    ))


@router.get("/orders/{order_id}")
def order_detail(
    order_id: str,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.get_order(db, user.hospital_id, order_id))


@router.post("/orders", status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.create_order(db, user.hospital_id, payload, user))


@router.post("/orders/{order_id}/collect")
def collect(
    order_id: str,
    payload: SampleCollectRequest,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.collect_sample(db, user.hospital_id, order_id, payload))


@router.post("/orders/{order_id}/advance")
def advance(
    order_id: str,
    payload: OrderAdvanceRequest = OrderAdvanceRequest(),
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.advance_order(db, user.hospital_id, order_id, payload))


@router.post("/orders/{order_id}/cancel")
def cancel(
    order_id: str,
    payload: OrderCancelRequest = OrderCancelRequest(),
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.cancel_order(db, user.hospital_id, order_id, payload))


# --- Results --------------------------------------------------------------- #
@router.post("/orders/{order_id}/results")
def save_result(
    order_id: str,
    payload: ResultSaveRequest,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.save_result(db, user.hospital_id, order_id, payload))


@router.post("/orders/{order_id}/results/{result_id}/verify")
def verify(
    order_id: str,
    result_id: str,
    payload: ResultVerifyRequest,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.verify_result(db, user.hospital_id, order_id, result_id, payload))


# --- Catalog --------------------------------------------------------------- #
@router.get("/catalog")
def catalog_list(
    include_inactive: bool = False,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.list_catalog(db, user.hospital_id, include_inactive=include_inactive))


@router.post("/catalog", status_code=status.HTTP_201_CREATED)
def catalog_create(
    payload: CatalogCreate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.create_catalog(db, user.hospital_id, payload))


@router.put("/catalog/{catalog_id}")
def catalog_update(
    catalog_id: str,
    payload: CatalogUpdate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.update_catalog(db, user.hospital_id, catalog_id, payload))


@router.delete("/catalog/{catalog_id}")
def catalog_delete(
    catalog_id: str,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    svc.delete_catalog(db, user.hospital_id, catalog_id)
    return ok(None, message="deleted")


# --- Inventory ------------------------------------------------------------- #
@router.get("/inventory")
def inventory_list(
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.list_inventory(db, user.hospital_id))


@router.post("/inventory", status_code=status.HTTP_201_CREATED)
def inventory_create(
    payload: InventoryCreate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.create_inventory(db, user.hospital_id, payload))


@router.put("/inventory/{item_id}")
def inventory_update(
    item_id: str,
    payload: InventoryUpdate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.update_inventory(db, user.hospital_id, item_id, payload))


@router.delete("/inventory/{item_id}")
def inventory_delete(
    item_id: str,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    svc.delete_inventory(db, user.hospital_id, item_id)
    return ok(None, message="deleted")


# --- Invoices -------------------------------------------------------------- #
@router.get("/invoices")
def invoices_list(
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.list_invoices(db, user.hospital_id))


@router.post("/invoices", status_code=status.HTTP_201_CREATED)
def invoice_create(
    payload: InvoiceCreate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.create_invoice(db, user.hospital_id, payload))


@router.post("/invoices/{invoice_id}/payment")
def invoice_payment(
    invoice_id: str,
    payload: InvoicePaymentRequest,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.record_invoice_payment(db, user.hospital_id, invoice_id, payload))


@router.delete("/invoices/{invoice_id}")
def invoice_delete(
    invoice_id: str,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    svc.delete_invoice(db, user.hospital_id, invoice_id)
    return ok(None, message="deleted")


# --- Expenses -------------------------------------------------------------- #
@router.get("/expenses")
def expenses_list(
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.list_expenses(db, user.hospital_id))


@router.post("/expenses", status_code=status.HTTP_201_CREATED)
def expense_create(
    payload: ExpenseCreate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.create_expense(db, user.hospital_id, payload))


@router.delete("/expenses/{expense_id}")
def expense_delete(
    expense_id: str,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    svc.delete_expense(db, user.hospital_id, expense_id)
    return ok(None, message="deleted")


# --- Suppliers ------------------------------------------------------------- #
@router.get("/suppliers")
def suppliers_list(
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.list_suppliers(db, user.hospital_id))


@router.post("/suppliers", status_code=status.HTTP_201_CREATED)
def supplier_create(
    payload: SupplierCreate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.create_supplier(db, user.hospital_id, payload))


@router.put("/suppliers/{supplier_id}")
def supplier_update(
    supplier_id: str,
    payload: SupplierUpdate,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.update_supplier(db, user.hospital_id, supplier_id, payload))


@router.post("/suppliers/{supplier_id}/payment")
def supplier_payment(
    supplier_id: str,
    payload: SupplierPaymentRequest,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.pay_supplier(db, user.hospital_id, supplier_id, payload))


@router.delete("/suppliers/{supplier_id}")
def supplier_delete(
    supplier_id: str,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    svc.delete_supplier(db, user.hospital_id, supplier_id)
    return ok(None, message="deleted")


# --- Trash ---------------------------------------------------------------- #
@router.get("/trash")
def trash_list(
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.list_trash(db, user.hospital_id))


@router.post("/trash/restore")
def trash_restore(
    payload: dict,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    model = payload.get("model")
    item_id = payload.get("id")
    if not model or not item_id:
        raise HTTPException(status_code=400, detail="model and id required")
    return ok(svc.restore(db, user.hospital_id, model, item_id))


# --- Reports -------------------------------------------------------------- #
@router.get("/reports")
def reports_list(
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    return ok(svc.list_reports(db, user.hospital_id))


@router.get("/reports/{order_id}/pdf")
def report_pdf(
    order_id: str,
    db=Depends(get_db),
    user: TokenData = Depends(require_roles("laboratory", "admin")),
):
    path = svc.report_pdf_path(db, user.hospital_id, order_id)
    if not path:
        raise HTTPException(status_code=404, detail="Report PDF not found")
    return FileResponse(path, media_type="application/pdf", filename=f"lab_report_{order_id}.pdf")
