---
description: "Reglas prioritarias para desarrollar el frontend: no modificar el backend, validar entradas de forma segura, usar tipos y catálogos permitidos, y tratar los códigos de árboles como valores generados por el sistema."
name: "Frontend Data Safety"
applyTo: "frontend/src/**/*.ts, frontend/src/**/*.tsx"
---

# Reglas prioritarias del frontend

Aplicar estas reglas antes de implementar o modificar cualquier módulo.

## 1. Límite de responsabilidad: solo frontend

- Está estrictamente prohibido modificar archivos, configuración, dependencias, rutas, modelos, base de datos o migraciones del `backend/`.
- Trabajar únicamente en el frontend. Si una función requiere cambios de backend o la API no ofrece los datos necesarios, no simularla ni modificar el backend: explicar la limitación y solicitar coordinación con su equipo.

## 2. Validar antes de aceptar o enviar datos

- Tratar todo valor de formulario como entrada no confiable, aunque provenga de un selector o de la API.
- Validar mientras la persona edita y volver a validar al enviar. Mostrar errores en el campo y bloquear la petición si hay valores inválidos.
- Usar los esquemas compartidos del frontend (Zod y React Hook Form donde corresponda) como fuente de validación y tipos; no duplicar reglas entre pantallas.
- Mantener el texto sin procesar solo como estado temporal del control de entrada. Convertirlo y validarlo antes de incorporarlo a los datos del dominio o al payload.
- No insertar, persistir ni enviar datos parcialmente válidos. Construir el payload exclusivamente con el resultado validado y normalizado del esquema.

## 3. Tipos y valores permitidos

- Representar números como números validados, opciones cerradas como uniones literales o enums, y campos opcionales de forma explícita (`null`/`undefined` según el contrato).
- No usar `string` para sustituir valores que tienen dominio cerrado, ni aceptar campos adicionales o valores arbitrarios del usuario.
- Validar límites, rangos, formatos, obligatoriedad condicional y relaciones entre campos. Evitar conversiones ambiguas: por ejemplo, un campo numérico vacío no debe transformarse accidentalmente en cero.
- Para conjuntos de signos, plagas, interferencias, fotografías u otros elementos múltiples, usar arreglos tipados de identificadores/opciones permitidas. Agregar elementos únicamente después de validar que pertenecen al catálogo; no aceptar texto libre como sustituto de esos códigos.
- Al consumir respuestas del servidor, comprobar el contrato antes de usarlas. Los tipos de TypeScript no validan datos recibidos en tiempo de ejecución.

## 4. Códigos de árbol generados, nunca digitados

- No presentar un campo editable para el código del árbol ni incluir un código escrito por la persona en el payload.
- El código debe derivarse del prefijo de la institución y de una secuencia única de árboles de esa institución, siguiendo el formato definido por el proyecto.
- No generar la secuencia autoritativa con contadores locales, datos de la lista cargada ni lógica del cliente: varios dispositivos podrían asignar el mismo número. Usar el código generado y devuelto por la API como valor canónico y mostrarlo como solo lectura.
- Si la API aún no genera ese código o no devuelve el prefijo/secuencia necesarios, no fabricar un valor en el frontend ni cambiar el backend; señalarlo como dependencia para coordinar con el equipo backend.
