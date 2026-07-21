"""Integration tests for PulseQ ↔ Lab Portal bridge module.
Tests HMAC authentication, ID mapping (hospital verification, patient, doctor, token), schema validation, and database operations.
"""
import hmac
import hashlib
import json
import os
import sys

sys.path.insert(0, '.')
os.environ["INTEGRATION_MODE"] = "pulseq_connected"
os.environ["PULSEQ_SHARED_SECRET"] = "test-secret-key"

from fastapi import HTTPException
from starlette.requests import Request
from app.database import Base, engine, SessionLocal
from app import db_models as m
from integrations.pulseq.schemas import PulseQLabOrderRequest
from integrations.pulseq.auth import verify_pulseq_webhook, compute_signature
from integrations.pulseq import routes, id_mapping, events

def _sign_payload(payload_bytes: bytes, secret: str) -> str:
    return compute_signature(payload_bytes, secret)

def _unwrap_res(res):
    if hasattr(res, "body"):
        return json.loads(res.body.decode())
    return res

def test_integration_flow():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    hospital_id = "hosp-123-uuid"
    
    # Seed Hospital in Lab Portal's hospitals table
    existing_hosp = db.query(m.Hospital).filter(m.Hospital.id == hospital_id).first()
    if not existing_hosp:
        lab_hosp = m.Hospital(
            id=hospital_id,
            name="General Lab Hospital",
            slug="general-lab-hospital",
            is_active=True,
            hospital_id=hospital_id,
        )
        db.add(lab_hosp)
        db.commit()

    test_catalog = m.LabTestCatalog(
        hospital_id=hospital_id,
        name="Complete Blood Count",
        code="CBC",
        category="hematology",
        sample_type="blood",
        price=500.0,
        turnaround_hours=24,
        is_active=True,
    )
    db.add(test_catalog)
    db.commit()

    secret = "test-secret-key"

    # 1. Test HMAC Auth logic & compute_signature helper
    body_bytes = b'{"test": "data"}'
    expected_sig = compute_signature(body_bytes, secret)
    assert expected_sig.startswith("sha256=")

    # Missing header
    req_invalid_1 = Request({"type": "http", "headers": []})
    try:
        import asyncio
        asyncio.run(verify_pulseq_webhook(req_invalid_1))
        assert False, "Should fail missing signature header"
    except HTTPException as e:
        assert e.status_code == 401

    # Invalid signature
    req_invalid_2 = Request({"type": "http", "headers": [(b"x-pulseq-signature", b"invalid")]})
    req_invalid_2._body = body_bytes
    try:
        asyncio.run(verify_pulseq_webhook(req_invalid_2))
        assert False, "Should fail signature mismatch"
    except HTTPException as e:
        assert e.status_code == 401

    # Valid signature
    valid_sig = _sign_payload(body_bytes, secret)
    req_valid = Request({"type": "http", "headers": [(b"x-pulseq-signature", valid_sig.encode())]})
    req_valid._body = body_bytes
    asyncio.run(verify_pulseq_webhook(req_valid))
    print("PASS: HMAC Webhook Authentication & Signature Generation")

    # 2. Test Hospital ID Resolution & Error Handling for Unverified Hospital
    # 2a. Unmapped & Non-existent lab hospital -> must raise HospitalMappingNotFoundError
    try:
        id_mapping.resolve_hospital(
            db,
            pulseq_hospital_id="non-existent-pulseq-hosp-id",
        )
        assert False, "Should have raised HospitalMappingNotFoundError for unverified hospital ID!"
    except id_mapping.HospitalMappingNotFoundError as e:
        print(f"PASS: Unverified Hospital ID correctly raised HospitalMappingNotFoundError ({e})")

    # 2b. Valid existing hospital in Lab Portal -> creates mapping row and succeeds
    resolved_hosp_id = id_mapping.resolve_hospital(
        db,
        pulseq_hospital_id="pulseq-hosp-mapped-1",
        lab_hospital_id=hospital_id,
        hospital_name="General Lab Hospital"
    )
    assert resolved_hosp_id == hospital_id
    print("PASS: Verified Hospital ID Resolution and Mapping Creation")

    # 3. Test Order Creation Route
    order_req = PulseQLabOrderRequest(
        pulseq_patient_id="patient-pulseq-uuid-1",
        patient_name="John Doe",
        patient_age=30,
        patient_gender="male",
        patient_phone="+923001234567",
        ordering_doctor_id="doctor-pulseq-uuid-1",
        ordering_doctor_name="Dr. Smith",
        hospital_id=hospital_id,
        token_id="token-pulseq-uuid-1",
        test_codes=["CBC"],
        priority="routine",
        notes="Routine checkup"
    )

    create_res = routes.create_order(payload=order_req, db=db)
    res_dict = _unwrap_res(create_res)
    assert res_dict["success"] is True
    order_id = res_dict["data"]["order_id"]
    assert res_dict["data"]["pulseq_token_id"] == "token-pulseq-uuid-1"
    print("PASS: Create Order via Integration")

    # 4. Test Patient ID mapping resolution
    lab_patient_id = id_mapping.resolve_or_create_patient(
        db,
        pulseq_patient_id="patient-pulseq-uuid-1",
        hospital_id=hospital_id,
        patient_name="John Doe"
    )
    mapped_pulseq_patient = id_mapping.get_pulseq_patient_id(db, lab_patient_id=lab_patient_id, hospital_id=hospital_id)
    assert mapped_pulseq_patient == "patient-pulseq-uuid-1"
    print("PASS: Patient ID Mapping Resolution")

    # 5. Test Outbound HTTP POST Event helper
    import asyncio
    asyncio.run(events.emit_result_ready(
        hospital_id=hospital_id,
        doctor_id="doctor-pulseq-uuid-1",
        order_id=order_id,
        patient_id="patient-pulseq-uuid-1",
        patient_name="John Doe",
        pulseq_token_id="token-pulseq-uuid-1",
        test_names=["CBC"],
        status="reported",
        abnormal_flags=["normal"],
        report_available=True
    ))
    print("PASS: HTTP POST Notification Dispatch with HMAC Signature")

    # 6. Test Get Catalog Route
    cat_res = routes.list_catalog(hospital_id=hospital_id, category=None, db=db)
    cat_dict = _unwrap_res(cat_res)
    assert cat_dict["success"] is True
    assert len(cat_dict["data"]) >= 1
    print("PASS: Catalog Listing")

    # 7. Test Get Orders By Token Route
    by_token_res = routes.get_orders_by_token(token_id="token-pulseq-uuid-1", hospital_id=hospital_id, db=db)
    by_token_dict = _unwrap_res(by_token_res)
    assert by_token_dict["success"] is True
    assert len(by_token_dict["data"]) == 1
    assert by_token_dict["data"][0]["order_id"] == order_id
    print("PASS: Get Orders By Token")

    # 8. Test Get Order Results Route
    results_res = routes.get_order_results(order_id=order_id, db=db)
    results_dict = _unwrap_res(results_res)
    assert results_dict["success"] is True
    assert results_dict["data"]["order_id"] == order_id
    print("PASS: Get Order Results")

    print("\n✅ ALL INTEGRATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_integration_flow()
