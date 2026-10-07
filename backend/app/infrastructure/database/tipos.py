from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


def ahora_utc() -> datetime:
    return datetime.now(UTC)


class FechaUTC(TypeDecorator):
    """Guarda las fechas en UTC y las devuelve con zona horaria.

    SQLite no conserva la zona horaria; así PostgreSQL y SQLite se comportan igual.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Las fechas deben tener zona horaria.")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC)
