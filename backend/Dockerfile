# Imagen del backend del Inventario Arbóreo Escolar.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/backend

# Primero las dependencias: si solo cambia el código, Docker reutiliza esta capa.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY seeds ./seeds

# Se ejecuta con un usuario sin privilegios. /datos/fotos es donde se monta el volumen de fotografías.
RUN useradd --create-home --uid 1000 arbol \
    && mkdir -p /datos/fotos \
    && chown -R arbol:arbol /datos
USER arbol

EXPOSE 8000

# --proxy-headers: detrás del proxy HTTPS, la API sabe que la conexión original fue segura.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
