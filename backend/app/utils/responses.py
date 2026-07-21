"""Standard response wrappers for the PulseQ backend.

Provides ok() and fail() functions to structure API outputs, including recursive
normalization of datetime objects and ISO-formatted strings to Pakistani format.
"""
from __future__ import annotations

import datetime
import re
from typing import Any
from fastapi.responses import JSONResponse


def normalize_dates(data: Any) -> Any:
    """Recursively search and format dates/datetimes to Pakistani format 'DD-MM-YYYY'."""
    if isinstance(data, dict):
        return {k: normalize_dates(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [normalize_dates(v) for v in data]
    elif isinstance(data, datetime.datetime):
        return data.strftime("%d-%m-%Y")
    elif isinstance(data, datetime.date):
        return data.strftime("%d-%m-%Y")
    elif isinstance(data, str):
        # YYYY-MM-DD
        if re.match(r"^\d{4}-\d{2}-\d{2}$", data):
            try:
                dt = datetime.datetime.strptime(data, "%Y-%m-%d")
                return dt.strftime("%d-%m-%Y")
            except ValueError:
                pass
        # ISO Datetime (YYYY-MM-DDTHH:MM:SS...)
        elif re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", data):
            try:
                val = data
                if val.endswith("Z"):
                    val = val[:-1] + "+00:00"
                dt = datetime.datetime.fromisoformat(val)
                return dt.strftime("%d-%m-%Y")
            except ValueError:
                pass
    return data


def ok(data: Any, message: str | None = None) -> dict:
    """Return a success response dictionary."""
    return {
        "success": True,
        "data": normalize_dates(data),
        "message": message,
    }


def fail(message: str, error_code: str | None = None, status_code: int = 400) -> JSONResponse:
    """Return a failure JSONResponse."""
    content = {
        "success": False,
        "message": message,
        "error_code": error_code,
    }
    return JSONResponse(
        status_code=status_code,
        content=normalize_dates(content),
    )
