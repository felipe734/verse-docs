// POST /api/enviar { pdfBase64, token, modo: "whatsapp" | "enlaces" }
// Solo acepta el MISMO PDF que pasó la revisión (token firmado con su huella SHA-256).
// Agrega la página de firmas y crea el proceso en Auco: firma primero la contraparte
// (documento + cara + código por celular) y luego la empresa (código por correo).
const { json, quien, leerBody, verificar, sha256, auco, airtable, AT, ahora } = require('../lib/util');
const { agregarPaginaFirmas } = require('../lib/firmas');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
  const q = quien(req);
  if (!q) return json(res, 401, { error: 'No autorizado' });
  try {
    const b = await leerBody(req);
    const t = verificar(b.token, 'envio');
    if (!t) return json(res, 403, { error: 'Sin revisión aprobada vigente. Vuelve a revisar el documento.' });
    if (!b.pdfBase64 || sha256(Buffer.from(b.pdfBase64, 'base64')) !== t.h) {
      return json(res, 403, { error: 'El PDF no es el mismo que se revisó. Vuelve a revisarlo.' });
    }
    const celular = process.env.FIRMANTE_CELULAR;
    if (!celular) return json(res, 500, { error: 'Falta FIRMANTE_CELULAR en Vercel' });
    const modo = b.modo === 'enlaces' ? 'enlaces' : 'whatsapp';

    // Idempotencia: si este registro ya tiene proceso en Auco, no crear otro
    const F = AT.firmasF;
    const reg = await airtable(`${AT.firmas}/${t.rid}?returnFieldsByFieldId=true`);
    if (reg.fields[F.aucoCode]) return json(res, 409, { error: 'Este documento ya se envió a firma', code: reg.fields[F.aucoCode] });

    const firmantes = t.f.map((f) => (f.rol === 'Contraparte' ? f : { ...f, phone: celular }));
    const { pdfBase64, posiciones } = await agregarPaginaFirmas(b.pdfBase64, { titulo: t.n, hash: t.h, firmantes });

    const signProfile = firmantes.map((f, i) => {
      const p = {
        name: f.name, email: f.email, phone: f.phone, role: 'SIGNER', order: String(i + 1),
        notification: modo !== 'enlaces', position: [posiciones[i]],
      };
      if (f.validacion === 'identidad') {
        Object.assign(p, {
          identification: String(f.identification || '').replace(/[^\dA-Za-z]/g, ''),
          identificationType: f.identificationType, country: String(f.country || 'CO').toUpperCase(),
          camera: true, otpCode: true,
          options: { camera: 'identification', otpCode: 'phone', ...(modo === 'whatsapp' ? { whatsapp: true, both: true } : {}) },
        });
      } else {
        Object.assign(p, { otpCode: true, options: { otpCode: 'email' } });
      }
      return p;
    });

    const r = await auco('/document/upload', {
      method: 'POST', privada: true,
      body: {
        email: process.env.AUCO_CREADOR_EMAIL || 'felipe@verseliving.com',
        name: t.n,
        subject: 'Firma de tu documento - Verse Group',
        message: 'Te enviamos tu documento para firma electrónica.',
        remember: 24,
        expiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        notification: modo !== 'enlaces',
        targetWebhooks: ['default'],
        custom: { firmaRecordId: t.rid, contratoRecordId: b.contratoRecordId || '', origen: 'verse-docs' },
        file: pdfBase64,
        signProfile,
      },
    });
    if (!r.ok || !r.data.document) {
      await airtable(`${AT.firmas}/${t.rid}`, { method: 'PATCH', body: { fields: { [F.log]: `${ahora()} · Auco rechazó el envío (${r.status}): ${JSON.stringify(r.data).slice(0, 400)}` } } });
      return json(res, 502, { error: 'Auco rechazó el proceso', status: r.status, auco: r.data });
    }
    await airtable(`${AT.firmas}/${t.rid}`, {
      method: 'PATCH',
      body: { typecast: true, fields: { [F.aucoCode]: r.data.document, [F.estado]: 'Enviado a firma', [F.log]: `${ahora()} · Enviado a Auco (${r.data.document}) por ${q.nombre} · modo ${modo}` } },
    });
    return json(res, 200, {
      code: r.data.document,
      modo,
      firmantes: firmantes.map(({ rol, name, email, phone }) => ({ rol, name, email, phone })),
      ids: r.data.signProfile || [],
      mensaje: modo === 'whatsapp' ? 'Enviado. Auco notifica por WhatsApp y correo en orden de firma.' : 'Proceso creado sin notificación. Usa los enlaces de cada firmante.',
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
};
