// POST /api/revisar { nombre, pdfBase64 } — paso obligatorio antes de firmar.
// Revisa con IA contra los modelos aprobados. Si hay alerta, queda en FIRMAS como Bloqueado
// (la automatización de Airtable le escribe a Felipe) y no se entrega token de envío.
// Si está OK, devuelve un token firmado que solo sirve para enviar ESE mismo PDF.
const { json, quien, leerBody, firmar, sha256, airtable, AT, EMPRESAS, REPRESENTANTE } = require('../lib/util');
const { revisar } = require('../lib/revision');

const MAX_BYTES = 3.2 * 1024 * 1024;

function texto(h) {
  return (h || []).map((x) => `[${x.severidad}] ${x.descripcion}${x.ubicacion ? ` (${x.ubicacion})` : ''}`).join('\n') || 'Sin hallazgos';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
  const q = quien(req);
  if (!q) return json(res, 401, { error: 'No autorizado' });
  try {
    const b = await leerBody(req);
    const nombre = String(b.nombre || 'Documento').slice(0, 120);
    if (!b.pdfBase64) return json(res, 400, { error: 'Falta el PDF' });
    const buf = Buffer.from(b.pdfBase64, 'base64');
    if (buf.length > MAX_BYTES) return json(res, 413, { error: 'El PDF supera 3 MB. Comprímelo y vuelve a subirlo.' });
    if (buf.subarray(0, 5).toString() !== '%PDF-') return json(res, 400, { error: 'El archivo no es un PDF' });
    const hash = sha256(buf);

    const rev = await revisar(b.pdfBase64);
    const ok = rev.resultado === 'ok';
    const emp = EMPRESAS[rev.empresa];
    const c = rev.contraparte || {};

    const F = AT.firmasF;
    const reg = await airtable(AT.firmas, {
      method: 'POST',
      body: {
        typecast: true,
        fields: {
          [F.documento]: nombre,
          [F.fecha]: new Date().toISOString(),
          [F.resultado]: ok ? 'OK' : 'Alerta',
          [F.estado]: ok ? 'Revisado' : 'Bloqueado',
          [F.tipo]: rev.tipo_documento || '',
          [F.empresa]: emp ? emp.razon : 'Desconocida',
          [F.contraparte]: [c.nombre, c.tipo_documento, c.numero_documento].filter(Boolean).join(' · '),
          [F.hallazgos]: texto(rev.hallazgos),
          [F.resumen]: rev.resumen || '',
          [F.subidoPor]: q.nombre,
          [F.canal]: q.canal,
          [F.hash]: hash,
        },
      },
    });

    let token = null;
    let firmantes = [];
    if (ok) {
      let cel = String(c.celular || '').replace(/[^\d+]/g, '');
      if (!cel.startsWith('+')) cel = (cel.length === 10 ? '+57' : '+') + cel;
      firmantes = [
        {
          rol: 'Contraparte', name: c.nombre, email: c.correo, phone: cel,
          identification: c.numero_documento, identificationType: c.tipo_documento || 'CC', country: c.pais_documento || 'CO',
          validacion: 'identidad', detalle: `${c.tipo_documento || ''} ${c.numero_documento || ''}`.trim(),
        },
        { rol: emp.razon, name: REPRESENTANTE, email: emp.email, validacion: 'otp', detalle: `Representante legal - NIT ${emp.nit}` },
      ];
      token = firmar({ h: hash, n: nombre, e: rev.empresa, f: firmantes, rid: reg.id, exp: Date.now() + 24 * 3600e3 }, 'envio');
    }

    return json(res, 200, {
      resultado: rev.resultado,
      registro: reg.id,
      tipo: rev.tipo_documento,
      modelo: rev.modelo,
      empresa: emp ? emp.razon : 'Desconocida',
      firmaPor: emp ? emp.email : null,
      contraparte: c,
      datos: rev.datos_clave || {},
      hallazgos: rev.hallazgos,
      resumen: rev.resumen,
      firmantes: firmantes.map(({ rol, name, email, phone }) => ({ rol, name, email, phone })),
      token,
      mensaje: ok ? 'Revisión OK. Puedes enviar a firma.' : 'Revisión con alerta. El documento quedó bloqueado y se avisó a Felipe por correo.',
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
};
