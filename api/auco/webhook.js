// POST /api/auco/webhook — eventos de Auco. Verifica el encabezado secreto y consulta el estado real en Auco.
// Actualiza en 9. LIVING:
//   FIRMAS: Estado y Log del registro del documento
//   CONTRATO (si el envío traía contratoRecordId): Auco Code, Auco Estado y Estado = Firmado al terminar,
//   y UNIDADES › Contrato Arriendo: adjunta el PDF firmado de primero, sin borrar los anteriores.
const { json, leerBody, secretoWebhook, safeEqual, auco, airtable, AT, ahora } = require('../../lib/util');

const ESTADO_CONTRATO = { NOTIFICATION: 'Firmó residente', REJECT: 'Rechazado', REJECTED: 'Rechazado', BLOCKED: 'Bloqueado', EXPIRED: 'Expirado', FINISH: 'Firmado' };
const ESTADO_FIRMAS = { NOTIFICATION: 'Firmó contraparte', REJECT: 'Rechazado', REJECTED: 'Rechazado', BLOCKED: 'Bloqueado', EXPIRED: 'Expirado', FINISH: 'Firmado' };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
  if (!safeEqual(req.headers['x-verse-webhook'], secretoWebhook())) return json(res, 401, { error: 'No autorizado' });
  const ev = await leerBody(req);
  if (!ev.code) return json(res, 200, { ok: true, ignorado: 'sin code' });
  try {
    const r = await auco(`/document?code=${encodeURIComponent(ev.code)}`);
    if (!r.ok) return json(res, 200, { ok: false, auco: r.status });
    const d = r.data;
    const custom = d.custom || {};
    const fin = d.status === 'FINISH';
    const firmantes = (d.signProfile || []).map((s) => `${s.name}: ${s.status}`).join(' · ');

    if (custom.firmaRecordId) {
      const F = AT.firmasF;
      const reg = await airtable(`${AT.firmas}/${custom.firmaRecordId}?returnFieldsByFieldId=true`);
      const est = fin ? 'Firmado' : ESTADO_FIRMAS[ev.status];
      const fields = { [F.log]: `${ahora()} · ${ev.status || '-'} · Auco ${d.status} · ${firmantes}\n${reg.fields[F.log] || ''}`.slice(0, 8000) };
      if (est) fields[F.estado] = est;
      await airtable(`${AT.firmas}/${custom.firmaRecordId}`, { method: 'PATCH', body: { typecast: true, fields } });
    }

    if (custom.contratoRecordId) {
      const recId = custom.contratoRecordId;
      const est = fin ? 'Firmado' : ESTADO_CONTRATO[ev.status];
      const campos = { [AT.f.aucoCode]: d.code };
      if (est) campos[AT.f.aucoEstado] = est;
      if (fin) campos[AT.f.contratoEstado] = 'Firmado';
      const rec = await airtable(`${AT.contrato}/${recId}?returnFieldsByFieldId=true`);
      await airtable(`${AT.contrato}/${recId}`, { method: 'PATCH', body: { fields: campos, typecast: true } });
      if (fin) {
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
    }
    return json(res, 200, { ok: true, estado: d.status });
  } catch (e) {
    console.error(e);
    return json(res, 200, { ok: false, error: e.message });
  }
};
