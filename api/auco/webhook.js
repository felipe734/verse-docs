// POST /api/auco/webhook — eventos de Auco. Verifica el encabezado secreto, consulta el estado real
// en Auco y, si el proceso tiene contratoRecordId, actualiza 9. LIVING:
//   CONTRATO: Auco Code, Auco Estado (y Estado = Firmado al terminar)
//   UNIDADES › Contrato Arriendo: adjunta el PDF firmado de primero, sin borrar los anteriores
const { json, leerBody, secretoWebhook, safeEqual, auco, airtable, AT } = require('../../lib/util');

const ESTADO = { NOTIFICATION: 'Firmó residente', REJECT: 'Rechazado', REJECTED: 'Rechazado', BLOCKED: 'Bloqueado', EXPIRED: 'Expirado', FINISH: 'Firmado' };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
  if (!safeEqual(req.headers['x-verse-webhook'], secretoWebhook())) return json(res, 401, { error: 'No autorizado' });
  const ev = await leerBody(req);
  // Responder rápido: Auco espera máximo 10 s
  if (!ev.code) return json(res, 200, { ok: true, ignorado: 'sin code' });
  try {
    const r = await auco(`/document?code=${encodeURIComponent(ev.code)}`);
    if (!r.ok) return json(res, 200, { ok: false, auco: r.status });
    const d = r.data;
    const recId = d.custom && d.custom.contratoRecordId;
    if (!recId) return json(res, 200, { ok: true, sinContrato: true });

    const estado = d.status === 'FINISH' ? 'Firmado' : ESTADO[ev.status];
    const campos = { [AT.f.aucoCode]: d.code };
    if (estado) campos[AT.f.aucoEstado] = estado;
    if (d.status === 'FINISH') campos[AT.f.contratoEstado] = 'Firmado';
    const rec = await airtable(`${AT.contrato}/${recId}?returnFieldsByFieldId=true`);
    await airtable(`${AT.contrato}/${recId}`, { method: 'PATCH', body: { fields: campos, typecast: true } });

    if (d.status === 'FINISH') {
      const uni = (rec.fields[AT.f.contratoUnidad] || [])[0];
      if (uni) {
        const u = await airtable(`${AT.unidades}/${uni}?returnFieldsByFieldId=true`);
        const actuales = u.fields[AT.f.unidadContratoArriendo] || [];
        if (!actuales.some((a) => (a.filename || '').includes(d.code))) {
          await airtable(`${AT.unidades}/${uni}`, {
            method: 'PATCH',
            body: { fields: { [AT.f.unidadContratoArriendo]: [{ url: d.url, filename: `${d.name || d.code} FIRMADO ${d.code}.pdf` }, ...actuales.map((a) => ({ id: a.id }))] } },
          });
        }
      }
    }
    return json(res, 200, { ok: true, estado: d.status });
  } catch (e) {
    console.error(e);
    return json(res, 200, { ok: false, error: e.message });
  }
};
