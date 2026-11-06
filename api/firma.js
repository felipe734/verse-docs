// POST /api/firma — crea un proceso de firma en Auco a partir de un PDF.
// Body JSON:
// {
//   "nombre": "Contrato VL_H4_04 - Laure Degot",
//   "pdfBase64": "<PDF en base64>",            // o "pdfUrl": "https://..."
//   "modo": "whatsapp" | "enlaces",           // whatsapp: Auco notifica por WhatsApp+correo; enlaces: sin notificación, devuelve ids
//   "firmantes": [
//     { "name", "email", "phone", "identification", "identificationType", "country",
//       "validacion": "identidad" | "otp", "position": [{ "page", "x", "y", "w", "h" }] }
//   ],
//   "contratoRecordId": "rec...",             // opcional: CONTRATO en 9. LIVING para el webhook
//   "venceDias": 7
// }
const { json, autorizado, leerBody, auco } = require('../lib/util');

function firmante(f, i, modo) {
  const p = {
    name: f.name, email: f.email, phone: f.phone, role: 'SIGNER', order: String(i + 1),
    notification: modo !== 'enlaces',
  };
  if (Array.isArray(f.position) && f.position.length) p.position = f.position;
  else if (f.label) p.label = true;
  if (f.validacion === 'identidad') {
    Object.assign(p, {
      identification: String(f.identification || '').replace(/[^\dA-Za-z]/g, ''),
      identificationType: f.identificationType || 'CC',
      country: (f.country || 'CO').toUpperCase(),
      camera: true, otpCode: true,
      options: { camera: 'identification', otpCode: 'phone', ...(modo === 'whatsapp' ? { whatsapp: true, both: true } : {}) },
    });
  } else {
    Object.assign(p, { otpCode: true, options: { otpCode: 'email' } });
  }
  return p;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
  if (!autorizado(req)) return json(res, 401, { error: 'No autorizado' });
  try {
    const b = await leerBody(req);
    const modo = b.modo === 'enlaces' ? 'enlaces' : 'whatsapp';
    const firmantes = Array.isArray(b.firmantes) ? b.firmantes : [];
    const faltan = [];
    if (!b.nombre) faltan.push('nombre');
    if (!b.pdfBase64 && !b.pdfUrl) faltan.push('pdfBase64 o pdfUrl');
    if (!firmantes.length) faltan.push('firmantes');
    firmantes.forEach((f, i) => ['name', 'email', 'phone'].forEach((k) => { if (!f[k]) faltan.push(`firmantes[${i}].${k}`); }));
    if (faltan.length) return json(res, 400, { error: 'Faltan datos', faltan });

    let file = b.pdfBase64;
    if (!file) {
      const r = await fetch(b.pdfUrl);
      if (!r.ok) return json(res, 400, { error: `No pude descargar el PDF (${r.status})` });
      file = Buffer.from(await r.arrayBuffer()).toString('base64');
    }
    const dias = Number(b.venceDias) > 3 ? Number(b.venceDias) : 7;
    const body = {
      email: process.env.AUCO_CREADOR_EMAIL || 'felipe@verseliving.com',
      name: b.nombre,
      subject: b.asunto || 'Firma de tu contrato - Verse Living',
      message: b.mensaje || 'Te enviamos tu contrato para firma electrónica. Gracias por elegir Verse Living.',
      remember: 24,
      expiredDate: new Date(Date.now() + dias * 86400000).toISOString(),
      notification: modo !== 'enlaces',
      targetWebhooks: ['default'],
      custom: { contratoRecordId: b.contratoRecordId || '', origen: 'verse-docs' },
      file,
      signProfile: firmantes.map((f, i) => firmante(f, i, modo)),
    };
    const r = await auco('/document/upload', { method: 'POST', body, privada: true });
    if (!r.ok || !r.data.document) return json(res, 502, { error: 'Auco rechazó el proceso', status: r.status, auco: r.data });
    return json(res, 200, {
      code: r.data.document,
      modo,
      ambiente: process.env.AUCO_ENV === 'prod' ? 'prod' : 'stage',
      firmantes: r.data.signProfile || [],
      identityValidation: r.data.identityValidation || null,
    });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
