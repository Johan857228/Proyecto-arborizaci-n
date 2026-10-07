"""Dependencias reutilizables de FastAPI."""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import Settings


def get_settings_app(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    db = request.app.state.sesiones()
    try:
        yield db
    finally:
        db.close()
