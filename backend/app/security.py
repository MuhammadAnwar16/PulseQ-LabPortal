"""JWT authentication and password hashing utilities (matches PulseQ patterns)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from typing import Any

import bcrypt
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.db_models import User, VALID_ROLES

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


class TokenData(BaseModel):
    user_id: str
    role: str
    hospital_id: str | None = None


def get_password_hash(password: str) -> str:
    """Pre-hash with SHA-256 and run bcrypt to bypass the 72-character limit."""
    sha256_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return bcrypt.hashpw(sha256_hash.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password by pre-hashing with SHA-256 and checking against bcrypt."""
    try:
        sha256_hash = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
        return bcrypt.checkpw(sha256_hash.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError, AttributeError):
        return False


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT access token using python-jose HS256."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"iat": now, "exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict[str, Any]) -> str:
    """Create a signed JWT refresh token (lasts 7 days)."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=7)
    to_encode.update({"iat": now, "exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> TokenData:
    """Validate bearer token and resolve to the authenticated user's TokenData."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        hospital_id = payload.get("hospital_id")
        if user_id is None or role is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload: missing sub or role",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Check database to ensure user is active and exists
        user = db.query(User).filter(User.id == user_id, User.is_deleted.is_(False)).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return TokenData(user_id=user_id, role=role, hospital_id=hospital_id)
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_roles(*allowed: str):
    """Dynamic role checks dependency factory. Returns a fastapi dependency function."""
    for role in allowed:
        if role not in VALID_ROLES:
            raise RuntimeError(f"Role '{role}' is not a recognised PulseQ role")

    def dependency(user: TokenData = Depends(get_current_user)) -> TokenData:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not permitted here",
            )
        return user

    dependency.__name__ = f"require_roles_{'_'.join(allowed)}"
    return dependency
