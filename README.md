# verse-docs

Servicio de documentos de Verse Group en Vercel. Hoy: firma electrónica con Auco. Mañana: frontend de generación de documentos.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/firma` | Crea un proceso de firma en Auco con un PDF y sus firmantes. Modo `whatsapp` (Auco notifica) o `enlaces` (sin notificación). |
| GET | `/api/estado?code=` | Estado del proceso y de cada firmante. |
| POST | `/api/auco/webhook` | Eventos de Auco. Actualiza CONTRATO y adjunta el firmado en UNIDADES › Contrato Arriendo (base 9. LIVING). |
| POST | `/api/auco/registrar-webhook` | Registra este webhook en Auco (una vez por ambiente). |
| GET | `/api/salud` | Qué variables están cargadas, sin mostrar valores. |

Todo excepto `/api/salud` y el webhook exige `Authorization: Bearer <VERSE_API_TOKEN>`. El webhook se valida con el encabezado `x-verse-webhook`, derivado del mismo token.

## Variables de entorno (Vercel)

| Variable | Qué es |
|---|---|
| `AUCO_ENV` | `stage` o `prod` |
| `AUCO_PUK` / `AUCO_PRK` | Llaves pública y privada de Auco del ambiente |
| `AIRTABLE_TOKEN` | Token personal de Airtable con lectura y escritura en 9. LIVING |
| `VERSE_API_TOKEN` | Token largo y aleatorio que usa la skill `vl-firma-auco` |
| `AUCO_CREADOR_EMAIL` | Opcional. Correo de la cuenta Auco que crea los procesos |

Nunca subas llaves al repositorio.
