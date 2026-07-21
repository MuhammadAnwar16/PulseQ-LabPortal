"""Seed a demo hospital, admin + lab user, and sample test catalog, orders, results, inventory, expenses, invoices, and suppliers.

Run from the backend/ directory:
    python seed.py
"""
from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))

from app.security import get_password_hash
from app.database import SessionLocal, init_db
from app.db_models import (
    Hospital,
    LabTestCatalog,
    User,
    LabTestOrder,
    LabTestOrderItem,
    LabTestResult,
    LabInventory,
    LabInvoice,
    LabSupplier,
    LabExpense,
)

SAMPLE_CATALOG = [
    {
        "name": "Complete Blood Count (CBC)",
        "code": "HEM-CBC",
        "category": "hematology",
        "sample_type": "blood",
        "price": 350.0,
        "turnaround_hours": 4,
        "reference_ranges": [
            {"param": "Hemoglobin", "unit": "g/dL", "low": 13.0, "high": 17.0},
            {"param": "WBC", "unit": "10^3/uL", "low": 4.0, "high": 11.0},
            {"param": "Platelets", "unit": "10^3/uL", "low": 150, "high": 400},
        ],
    },
    {
        "name": "Fasting Blood Glucose",
        "code": "BIO-GLU",
        "category": "biochemistry",
        "sample_type": "blood",
        "price": 200.0,
        "turnaround_hours": 2,
        "reference_ranges": [
            {"param": "Glucose", "unit": "mg/dL", "low": 70, "high": 100},
        ],
    },
    {
        "name": "Lipid Profile",
        "code": "BIO-LIP",
        "category": "biochemistry",
        "sample_type": "blood",
        "price": 600.0,
        "turnaround_hours": 6,
        "reference_ranges": [
            {"param": "Cholesterol", "unit": "mg/dL", "low": 0, "high": 200},
            {"param": "Triglycerides", "unit": "mg/dL", "low": 0, "high": 150},
        ],
    },
    {
        "name": "Urine Routine",
        "code": "MIC-URI",
        "category": "microbiology",
        "sample_type": "urine",
        "price": 250.0,
        "turnaround_hours": 8,
        "reference_ranges": [
            {"param": "pH", "unit": "", "low": 5.0, "high": 8.0},
            {"param": "Protein", "unit": "", "low": 0, "high": 0},
        ],
    },
    {
        "name": "Chest X-Ray",
        "code": "RAD-CXR",
        "category": "radiology",
        "sample_type": "radiology",
        "price": 800.0,
        "turnaround_hours": 1,
        "reference_ranges": [],
    },
]


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        hosp = db.query(Hospital).filter(Hospital.slug == "pulseq-demo").first()
        if not hosp:
            hid = str(uuid.uuid4())
            hosp = Hospital(
                id=hid,
                hospital_id=hid,
                name="PulseQ Demo Hospital",
                slug="pulseq-demo",
                is_active=True,
            )
            db.add(hosp)
            db.flush()
            print(f"Created hospital {hosp.name} ({hosp.id})")
        else:
            print(f"Hospital already exists ({hosp.id})")

        hid = hosp.id

        # Clear existing dynamic laboratory portal data to ensure seeding is clean
        db.query(LabTestOrderItem).filter(LabTestOrderItem.hospital_id == hid).delete()
        db.query(LabTestResult).filter(LabTestResult.hospital_id == hid).delete()
        db.query(LabTestOrder).filter(LabTestOrder.hospital_id == hid).delete()
        db.query(LabInventory).filter(LabInventory.hospital_id == hid).delete()
        db.query(LabInvoice).filter(LabInvoice.hospital_id == hid).delete()
        db.query(LabSupplier).filter(LabSupplier.hospital_id == hid).delete()
        db.query(LabExpense).filter(LabExpense.hospital_id == hid).delete()
        db.flush()

        # admin
        if not db.query(User).filter(User.username == "admin").first():
            db.add(
                User(
                    hospital_id=hid,
                    username="admin",
                    full_name="Lab Administrator",
                    hashed_password=get_password_hash("admin123"),
                    role="admin",
                    is_active=True,
                )
            )
            print("Created admin user (admin / admin123)")

        # lab staff
        if not db.query(User).filter(User.username == "labtech").first():
            db.add(
                User(
                    hospital_id=hid,
                    username="labtech",
                    full_name="Lab Technician",
                    hashed_password=get_password_hash("lab123"),
                    role="laboratory",
                    is_active=True,
                )
            )
            print("Created lab user (labtech / lab123)")

        # Catalog
        existing_catalog = {c.code: c for c in db.query(LabTestCatalog).filter(
            LabTestCatalog.hospital_id == hid, LabTestCatalog.is_deleted.is_(False)
        )}
        catalog_map = {}
        for item in SAMPLE_CATALOG:
            code = item["code"]
            if code in existing_catalog:
                catalog_map[code] = existing_catalog[code]
                continue
            cat_item = LabTestCatalog(
                hospital_id=hid,
                name=item["name"],
                code=code,
                category=item["category"],
                sample_type=item["sample_type"],
                price=item["price"],
                turnaround_hours=item["turnaround_hours"],
                reference_ranges=__import__("json").dumps(item["reference_ranges"]),
                is_active=True,
            )
            db.add(cat_item)
            db.flush()
            catalog_map[code] = cat_item
        print("Test catalog loaded.")

        # Reagents (Inventory)
        reagents = [
            {"name": "EDTA Collection Tubes (100ml)", "sku": "EDTA-TUBE-100", "quantity": 15, "reorder_level": 40, "expiry_date": "2027-04-15", "unit_cost": 2.50, "category": "Consumables"},
            {"name": "Glucose Assay Reagent Kit", "sku": "GLU-KIT-A", "quantity": 4, "reorder_level": 10, "expiry_date": "2026-11-20", "unit_cost": 45.00, "category": "Kits"},
            {"name": "Urine Analysis Test Strips", "sku": "URN-STRIP-200", "quantity": 120, "reorder_level": 80, "expiry_date": "2027-08-01", "unit_cost": 0.80, "category": "Consumables"},
            {"name": "Lipid Calibration Standards", "sku": "LIP-CAL-X", "quantity": 8, "reorder_level": 5, "expiry_date": "2026-09-10", "unit_cost": 15.50, "category": "Reagents"},
            {"name": "CBC Lyse Reagent (1L)", "sku": "LYSE-CBC-1L", "quantity": 2, "reorder_level": 4, "expiry_date": "2026-12-05", "unit_cost": 85.00, "category": "Reagents"},
        ]
        for r in reagents:
            db.add(
                LabInventory(
                    hospital_id=hid,
                    name=r["name"],
                    sku=r["sku"],
                    quantity=r["quantity"],
                    reorder_level=r["reorder_level"],
                    expiry_date=r["expiry_date"],
                    unit_cost=r["unit_cost"],
                    category=r["category"],
                )
            )
        print("Reagent inventory loaded.")

        # Suppliers
        suppliers = [
            {"name": "BioMed Diagnostics Lahore", "contact": "+92 42 35789123", "outstanding_balance": 15000.0},
            {"name": "Avanz Healthcare Karachi", "contact": "info@avanz.com.pk", "outstanding_balance": 0.0},
            {"name": "Nexus Scientific Supply", "contact": "+92 51 44558899", "outstanding_balance": 8200.0},
        ]
        for s in suppliers:
            db.add(
                LabSupplier(
                    hospital_id=hid,
                    name=s["name"],
                    contact=s["contact"],
                    outstanding_balance=s["outstanding_balance"],
                )
            )
        print("Suppliers loaded.")

        # Expenses
        expenses = [
            {"category": "Equipment Maintenance", "description": "Biochemistry Analyzer quarterly service contract payment", "amount": 12500.0, "incurred_on": "2026-07-02"},
            {"category": "Reagent Purchase", "description": "Bulk restock of CBC Lyse and Glucose Kits from BioMed", "amount": 8500.0, "incurred_on": "2026-07-10"},
            {"category": "Disposables", "description": "Purchase of sterile syringes, gloves, and alcohol prep pads", "amount": 3200.0, "incurred_on": "2026-07-14"},
            {"category": "Utilities", "description": "Laboratory dedicated generator diesel restock", "amount": 5000.0, "incurred_on": "2026-07-15"},
        ]
        for e in expenses:
            db.add(
                LabExpense(
                    hospital_id=hid,
                    category=e["category"],
                    description=e["description"],
                    amount=e["amount"],
                    incurred_on=e["incurred_on"],
                )
            )
        print("Expenses loaded.")

        # Orders & Invoices & Results
        now_time = datetime.now(timezone.utc)
        
        # Order 1: Urgent Pending Order
        ord1 = LabTestOrder(
            hospital_id=hid,
            patient_id=str(uuid.uuid4()),
            patient_name="Muhammad Anwar",
            patient_age=32,
            patient_gender="Male",
            ordering_doctor_name="Dr. Haris Malik",
            test_ids=__import__("json").dumps([catalog_map["HEM-CBC"].id]),
            status="ordered",
            priority="urgent",
            source="internal",
            created_at=now_time - timedelta(minutes=45),
        )
        db.add(ord1)
        db.flush()
        db.add(LabTestOrderItem(hospital_id=hid, order_id=ord1.id, test_id=catalog_map["HEM-CBC"].id))
        db.add(LabInvoice(hospital_id=hid, order_id=ord1.id, amount=350.0, paid_amount=0.0, status="unpaid"))

        # Order 2: Sample Collected
        ord2 = LabTestOrder(
            hospital_id=hid,
            patient_id=str(uuid.uuid4()),
            patient_name="Ayesha Khan",
            patient_age=28,
            patient_gender="Female",
            ordering_doctor_name="Dr. Sana Riaz",
            test_ids=__import__("json").dumps([catalog_map["BIO-GLU"].id]),
            status="sample_collected",
            priority="routine",
            sample_type="blood",
            sample_barcode="BC-992211",
            collected_at=now_time - timedelta(hours=1, minutes=30),
            collected_by="Staff Sarah",
            source="internal",
            created_at=now_time - timedelta(hours=2),
        )
        db.add(ord2)
        db.flush()
        db.add(LabTestOrderItem(hospital_id=hid, order_id=ord2.id, test_id=catalog_map["BIO-GLU"].id))
        db.add(LabInvoice(hospital_id=hid, order_id=ord2.id, amount=200.0, paid_amount=200.0, status="paid", payment_method="Cash"))

        # Order 3: In Processing
        ord3 = LabTestOrder(
            hospital_id=hid,
            patient_id=str(uuid.uuid4()),
            patient_name="Tariq Mahmood",
            patient_age=55,
            patient_gender="Male",
            ordering_doctor_name="Dr. Haris Malik",
            test_ids=__import__("json").dumps([catalog_map["MIC-URI"].id]),
            status="processing",
            priority="routine",
            sample_type="urine",
            sample_barcode="BC-883344",
            collected_at=now_time - timedelta(hours=3),
            collected_by="Staff Sarah",
            source="internal",
            created_at=now_time - timedelta(hours=3, minutes=20),
        )
        db.add(ord3)
        db.flush()
        db.add(LabTestOrderItem(hospital_id=hid, order_id=ord3.id, test_id=catalog_map["MIC-URI"].id))
        db.add(LabInvoice(hospital_id=hid, order_id=ord3.id, amount=250.0, paid_amount=0.0, status="unpaid"))

        # Order 4: Completed + Verified
        ord4 = LabTestOrder(
            hospital_id=hid,
            patient_id=str(uuid.uuid4()),
            patient_name="Zainab Ali",
            patient_age=45,
            patient_gender="Female",
            ordering_doctor_name="Walk-in Patient",
            test_ids=__import__("json").dumps([catalog_map["BIO-LIP"].id]),
            status="completed",
            priority="routine",
            sample_type="blood",
            sample_barcode="BC-112233",
            collected_at=now_time - timedelta(hours=5),
            collected_by="Staff Sarah",
            source="external",
            created_at=now_time - timedelta(hours=5, minutes=15),
        )
        db.add(ord4)
        db.flush()
        db.add(LabTestOrderItem(hospital_id=hid, order_id=ord4.id, test_id=catalog_map["BIO-LIP"].id))
        db.add(LabInvoice(hospital_id=hid, order_id=ord4.id, amount=600.0, paid_amount=300.0, status="partial", payment_method="Card"))
        
        # Test result for completed order
        res4 = LabTestResult(
            hospital_id=hid,
            order_id=ord4.id,
            test_id=catalog_map["BIO-LIP"].id,
            result_values=__import__("json").dumps([
                {"param": "Cholesterol", "value": "185", "unit": "mg/dL", "low": 0.0, "high": 200.0, "abnormal": False},
                {"param": "Triglycerides", "value": "165", "unit": "mg/dL", "low": 0.0, "high": 150.0, "abnormal": True},
            ]),
            abnormal_flag="abnormal",
            status="verified",
            entered_by="Lab Technician",
            verified_by="Pathologist Dr. Jamil",
            verified_at=now_time - timedelta(hours=1),
        )
        db.add(res4)

        db.commit()
        print("Rich seed complete successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
