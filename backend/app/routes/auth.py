"""Authentication routes (shared across portals)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.security import (
    TokenData,
    create_access_token,
    require_roles,
    verify_password,
)
from app.database import get_db
from app.db_models import User
from app.schemas import LoginRequest
from app.utils.responses import ok

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest, db=Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
        )
    # create_access_token takes a dictionary in the new architecture
    token = create_access_token(data={"sub": user.id, "role": user.role, "hospital_id": user.hospital_id})
    return ok({
        "access_token": token,
        "token_type": "bearer",
        "user": user.to_dict()
    })


@router.get("/me")
def me(user: TokenData = Depends(require_roles("laboratory", "admin", "doctor", "reception", "pharmacy"))):
    """Return the authenticated principal (used by the frontend auth guard)."""
    return ok(user.model_dump())
