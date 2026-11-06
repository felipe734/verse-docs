# verse-docs

Plataforma de documentos de Verse Group en `https://docs.verseliving.com` (Vercel, se despliega con cada push a `main`).

## Flujo (igual desde la plataforma o desde Claude con la skill `vl-firma-auco`)

1. **Subir** el PDF.
2. **Revisión con IA** (`/api/revisar`): Claude compara el documento con el modelo aprobado (`modelos/`, sincronizados desde Drive) y revisa la coherencia de los datos. Si encuentra algo de severidad alta o media, si no hay modelo o faltan datos de la contraparte, el documento queda **Bloqueado** en FIRMAS y la automatización de Airtable le escribe a Felipe. No se entrega token de envío.
3. **Quién firma**: la revisión determina si firma C&C GROUP SAS (`comercial@constructoraccgroup.com`) o VERSE GROUP SAS (`felipe@verseliving.com`).
4. **Envío** (`/api/enviar`): solo acepta el mismo PDF revisado (token firmado con su SHA-256, válido 24 h). Agrega una página de firmas y crea el proceso en Auco: primero la contraparte (documento + cara + código por WhatsApp), luego la empresa (código por correo). Modo `whatsapp` (Auco notifica) o `enlaces` (sin notificación).
5. **Seguimiento** (`/api/auco/webhook`): actualiza FIRMAS y, si el envío traía `contratoRecordId`, el CONTRATO y UNIDADES › Contrato Arriendo con el PDF firmado.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| POST/GET/DELETE | `/api/login` | Equipo: nombre + `TEAM_PASSWORD`. Sesión de 12 h en cookie HttpOnly. |
| POST | `/api/revisar` | Sesión o `Bearer VERSE_API_TOKEN` |
| POST | `/api/enviar` | Sesión o Bearer, con token de revisión OK |
| GET | `/api/estado?code=` | Sesión o Bearer |
| POST | `/api/auco/webhook` | Encabezado `x-verse-webhook` derivado de `VERSE_API_TOKEN` |
| POST | `/api/auco/registrar-webhook` | Sesión o Bearer. Una vez por ambiente. |
| GET | `/api/salud` | Público. Muestra qué variables están cargadas, sin valores. |

## Variables de entorno (Vercel, tipo Sensitive)

| Variable | Qué es |
|---|---|
| `AUCO_ENV` | `stage` o `prod` |
| `AUCO_PUK` / `AUCO_PRK` | Llaves de Auco del ambiente |
| `AIRTABLE_TOKEN` | Token personal con lectura y escritura en 9. LIVING (`appzaNZaaYKfdZObP`) |
| `VERSE_API_TOKEN` | Token de la skill y semilla de las firmas internas |
| `ANTHROPIC_API_KEY` | Llave de la API de Claude para la revisión |
| `TEAM_PASSWORD` | Contraseña del equipo para la plataforma |
| `FIRMANTE_CELULAR` | Celular de Juan Felipe Tobar con indicativo (+57...) |
| `REVISION_MODEL` | Opcional. Modelo de Claude para revisar (por defecto `claude-sonnet-5-5`) |

## Modelos aprobados

Los modelos viven en Drive (carpeta **Verse Docs · Modelos**). Para actualizarlos: pídele a Claude "sincroniza los modelos de Verse Docs". Claude los convierte a texto con los campos variables entre `{{ }}`, los guarda en `modelos/<id>.txt`, corre `node scripts/modelos.js` y hace push. Un documento sin modelo aprobado siempre queda bloqueado.

Modelos actuales: `vl-coliving` (habitación coliving Verse Living, firma C&C).

## Pruebas locales

`node scripts/prueba-local.js <pdf>` simula Claude, Auco y Airtable y verifica: sin sesión, login, alerta, sin modelo, PDF alterado, token falso y envío correcto.

Nunca subas llaves al repositorio.
