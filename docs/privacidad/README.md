# Privacidad de menores en Arbolado Escolar

La mayoría de quienes usan la app son estudiantes menores de edad. En Colombia sus datos solo se
pueden tratar en su interés superior y con autorización del acudiente, después de escuchar al
estudiante (Ley 1581 de 2012, art. 7; Decreto 1377 de 2013, art. 12, compilado en el DUR 1074,
art. 2.2.2.25.2.9). Este documento explica qué hace la app, cómo activarlo y qué le toca a cada
institución.

> Es una guía técnica, no asesoría legal. Cada institución debe revisar la política y los
> formatos con su asesor jurídico.

## Qué hace la app

| Medida | Dónde |
|---|---|
| Aceptar la política de tratamiento de datos al crear la cuenta (y de nuevo si cambia la versión) | Registro y *Privacidad y mis datos* |
| Autorización del acudiente: firmada en la app (el acudiente escribe su nombre) o formato físico escaneado que sube el docente; siempre con la confirmación de que se escuchó al estudiante | *Privacidad y mis datos* → *Firmar con mi acudiente*; docentes en *Privacidad de la institución* |
| Revocar la autorización | El estudiante o su docente |
| En los rankings, los demás estudiantes ven un alias o las iniciales (`L. M.`); docentes y administradores siguen viendo el nombre | Vista `perfiles_publicos` (migración 005) |
| Quitar los metadatos de todas las fotos (ubicación del teléfono, modelo, autor) antes de guardarlas o enviarlas a la IA; se conserva solo la orientación | `comun.limpiar_metadatos`, en cada subida |
| Aviso junto a cada botón de foto: fotografiar solo el árbol, sin rostros | Registro, inspecciones, ficha del árbol y Savia |
| La IA no describe a las personas que aparezcan en una foto | Instrucciones de Savia (`servicios/ia.py`) |
| La ubicación GPS que se guarda es la del árbol, nunca la del estudiante | Registro e inspecciones |
| Descargar mis datos (JSON) | *Privacidad y mis datos* |
| Solicitudes de consulta, rectificación, supresión y revocatoria, con fecha límite (10 días hábiles las consultas, 15 los reclamos; Ley 1581, arts. 14 y 15) | Estudiante: *Privacidad y mis datos*. Docente o administrador: *Privacidad de la institución* |
| Anonimizar a un egresado: nombre genérico, sin correo, alias ni fotos, cuenta inactiva y sin acceso; sus registros de árboles se conservan | Administrador, en *Privacidad de la institución* |

## Cómo activarlo

1. Aplica `backend/sql/005_privacidad.sql` en el editor SQL de Supabase (después de la 001 a la 004).
   Se puede ejecutar más de una vez.
2. Reinicia el backend. La versión vigente de la política está en `POLITICA_VERSION`
   (`backend/comun.py`) y en `frontend/src/features/privacidad/components/PoliticaDatos.tsx`:
   si cambias el texto, sube la versión en los dos lugares y la app volverá a pedir que se acepte.

Sin la migración, las pantallas de privacidad muestran un error y el resto de la app sigue funcionando.

## Qué le toca a la institución

- **Revisar la política** (texto en la app y en `/politica`) y publicar su canal de atención
  (correo o dependencia que responde las solicitudes).
- **Ser responsable del tratamiento**: la institución (o su entidad territorial, si es oficial)
  es la responsable; el equipo de Arbolado Escolar es el encargado. Conviene firmar un contrato de
  transmisión de datos con el encargado y listar a los subencargados: Supabase (almacenamiento y
  autenticación) y Anthropic (análisis de fotos con IA).
- **Inscribir la base de datos en el RNBD** de la Superintendencia de Industria y Comercio cuando
  la ley lo exija (por ejemplo, entidades públicas según el Decreto 090 de 2018).
- **Recoger las autorizaciones** de los acudientes al iniciar el año, con el formato de abajo o
  con la firma en la app.
- **Responder las solicitudes a tiempo** desde *Privacidad de la institución*.
- **Anonimizar a los egresados** cuando terminen su vínculo.

## Formato de autorización para imprimir

> **Autorización para el tratamiento de datos personales de un estudiante menor de edad**
>
> Yo, ______________________________, identificado(a) con documento N.° ______________, en
> calidad de ☐ madre ☐ padre ☐ acudiente ☐ otro: __________ del estudiante
> ______________________________, del curso ______, de la institución
> ______________________________, autorizo a esta institución, como responsable, y al equipo de
> Arbolado Escolar, como encargado, para tratar los datos de mi acudido (nombre, correo, curso,
> registros e inspecciones de árboles, fotos de árboles y puntos de participación) con las
> finalidades descritas en la Política de tratamiento de datos de Arbolado Escolar, versión
> 2026-10-v1, que leí.
>
> Declaro que hablé con el estudiante sobre el uso de sus datos y tuve en cuenta su opinión.
> Sé que puedo consultar, corregir o pedir que se eliminen sus datos y retirar esta autorización
> en cualquier momento, desde la app o con la institución.
>
> Firma: ______________________ Fecha: ____ / ____ / ________ Teléfono o correo: ______________

El docente fotografía el formato firmado y lo sube en *Privacidad de la institución* →
*Registrar autorización* → *Subir formato firmado*. Solo lo ven los docentes de la institución y
los administradores.

## Pendiente o por confirmar

- Desenfocar rostros automáticamente en las fotos (hoy hay aviso y la IA no describe personas).
- Si alojar datos de menores en Supabase y enviar fotos a la IA fuera de Colombia exige requisitos
  adicionales de transferencia internacional.
- Firma electrónica con mayor valor probatorio (Ley 527 de 1999) para las autorizaciones y certificados.
