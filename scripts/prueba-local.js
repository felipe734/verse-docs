// Prueba local sin red: simula Claude, Auco y Airtable con un fetch falso.
//   node scripts/prueba-local.js <pdf>
const fs = require('fs');
const path = require('path');
process.env.VERSE_API_TOKEN = 'token-prueba';
process.env.TEAM_PASSWORD = 'clave-prueba';
process.env.ANTHROPIC_API_KEY = 'x';
process.env.AUCO_PRK = 'prk_x'; process.env.AUCO_PUK = 'puk_x';
process.env.AIRTABLE_TOKEN = 'x'; process.env.FIRMANTE_CELULAR = '+573000000001';

const llamadas = [];
let revisionSimulada;
global.fetch = async (url, opt = {}) => {
  llamadas.push(`${opt.method || 'GET'} ${url}`);
  const body = opt.body ? JSON.parse(opt.body) : null;
  const ok = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });
  if (url.includes('anthropic.com')) return ok({ content: [{ type: 'tool_use', name: 'resultado_revision', input: revisionSimulada }] });
  if (url.includes('airtable.com')) {
    if (opt.method === 'POST') return ok({ id: 'recPRUEBA0000001', fields: body.fields });
    if (!opt.method || opt.method === 'GET') return ok({ id: 'recPRUEBA0000001', fields: {} });
    return ok({ id: 'recPRUEBA0000001', fields: body.fields });
  }
  if (url.includes('auco.ai')) {
    global.ultimoAuco = body;
    return ok({ document: 'ABCDEF1234' });
  }
  throw new Error('fetch inesperado ' + url);
};

function llamar(handler, { method = 'POST', body, headers = {} }) {
  return new Promise((resolve) => {
    const req = { method, headers, body, url: '/x' };
    const res = { statusCode: 200, h: {}, setHeader(k, v) { this.h[k] = v; }, end(s) { resolve({ status: this.statusCode, body: JSON.parse(s), headers: this.h }); } };
    handler(req, res);
  });
}

(async () => {
  const pdf = fs.readFileSync(process.argv[2]).toString('base64');
  const revisar = require('../api/revisar');
  const enviar = require('../api/enviar');
  const login = require('../api/login');
  const BEARER = { authorization: 'Bearer token-prueba' };
  const contraparte = { nombre: 'Laure Degot', tipo_documento: 'CC', numero_documento: '1193594617', pais_documento: 'CO', correo: 'laure@example.com', celular: '3117971122' };

  // 1. Sin autenticación
  let r = await llamar(revisar, { body: { pdfBase64: pdf } });
  console.log('1 sin auth ->', r.status);

  // 2. Login equipo
  r = await llamar(login, { body: { nombre: 'Diana', password: 'mala' } });
  console.log('2a login malo ->', r.status);
  r = await llamar(login, { body: { nombre: 'Diana', password: 'clave-prueba' } });
  const cookie = r.headers['Set-Cookie'].split(';')[0];
  console.log('2b login bueno ->', r.status, cookie.slice(0, 12) + '...');

  // 3. Revisión con alerta (cláusula cambiada) -> sin token
  revisionSimulada = { modelo: 'vl-coliving', tipo_documento: 'Contrato coliving', empresa: 'cyc', contraparte, hallazgos: [{ severidad: 'alta', descripcion: 'La cláusula penal cambió de 1 a 3 cánones' }], resumen: 'Cambio en penalidad' };
  r = await llamar(revisar, { headers: { cookie }, body: { nombre: 'Contrato prueba', pdfBase64: pdf } });
  console.log('3 alerta ->', r.status, r.body.resultado, 'token:', r.body.token);

  // 4. Revisión sin modelo aprobado -> alerta aunque la IA diga ok
  revisionSimulada = { modelo: null, tipo_documento: 'Otro', empresa: 'verse', contraparte, hallazgos: [], resumen: 'ok' };
  r = await llamar(revisar, { headers: BEARER, body: { nombre: 'Otro', pdfBase64: pdf } });
  console.log('4 sin modelo ->', r.body.resultado, r.body.hallazgos.map((h) => h.descripcion).join(' | '));

  // 5. Revisión OK -> token, C&C firma con comercial@
  revisionSimulada = { modelo: 'vl-coliving', tipo_documento: 'Contrato coliving', empresa: 'cyc', contraparte, hallazgos: [{ severidad: 'baja', descripcion: 'doble espacio' }], resumen: 'Coincide con el modelo' };
  r = await llamar(revisar, { headers: BEARER, body: { nombre: 'Contrato VL H4 Laure', pdfBase64: pdf } });
  console.log('5 ok ->', r.body.resultado, r.body.firmaPor, r.body.firmantes.map((f) => f.email).join(', '));
  const token = r.body.token;

  // 6. Enviar con PDF distinto -> rechazado
  const otro = Buffer.from(Buffer.from(pdf, 'base64').toString('latin1') + '\n%x', 'latin1').toString('base64');
  let e = await llamar(enviar, { headers: BEARER, body: { pdfBase64: otro, token } });
  console.log('6 pdf cambiado ->', e.status, e.body.error);

  // 7. Token falsificado -> rechazado
  e = await llamar(enviar, { headers: BEARER, body: { pdfBase64: pdf, token: token.slice(0, -3) + 'abc' } });
  console.log('7 token falso ->', e.status);

  // 8. Envío correcto
  e = await llamar(enviar, { headers: { cookie }, body: { pdfBase64: pdf, token, modo: 'whatsapp' } });
  console.log('8 envio ->', e.status, e.body.code, e.body.mensaje);
  const sp = global.ultimoAuco.signProfile;
  console.log('   firmantes Auco:', sp.map((s) => `${s.order}:${s.email}:${s.options.otpCode}:${JSON.stringify(s.position[0])}`).join(' || '));
  fs.writeFileSync('/tmp/claude-0/enviado.pdf', Buffer.from(global.ultimoAuco.file, 'base64'));
  console.log('   PDF con página de firmas guardado');
})();
