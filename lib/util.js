// Utilidades compartidas de verse-docs (Vercel Functions, Node 22)
const crypto = require('crypto');

const AUCO_BASE = process.env.AUCO_ENV === 'prod'
  ? 'https://api.auco.ai/v1.5/ext'
  : 'https://dev.auco.ai/v1.5/ext';

// Airtable 9. LIVING
const AT = {
  base: 'appzaNZaaYKfdZObP',
  contrato: 'tblxQ4njsGL6uyAe3',
  unidades: 'tblp0bqTnMi0LTezh',
  firmas: 'tblQ5Wy5aO95sBgq8',
  f: {
    contratoUnidad: 'fldwDfCdi5tOlKKyO',
    contratoEstado: 'fldeiURO8INV2Co3n',
    aucoCode: 'fldUb57xbrcs2o1J6',
    aucoEstado: 'fldTV3FaGLOnnrJCA',
    unidadContratoArriendo: 'fldgPCGslk9pkp37e',
  },
  firmasF: {
    documento: 'fldWA2ktDGISaoNns', fecha: 'fldxHVJrXTVn1Bw2P', resultado: 'fldWmq2Dfgh945eiW',
    estado: 'fldif0vzKsqGFn5je', tipo: 'fldoU8wqMlv7fWpKs', empresa: 'fldfJwToa4pOu58xV',
    contraparte: 'fld4j4PjXfxO7qiLL', hallazgos: 'fldIW8d3aJXd09pXi', resumen: 'fldRi9FEd3EG45pTb',
    subidoPor: 'fldWxd9IiFtWmumWu', canal: 'fldWuw5Y0Wmws3fqa', hash: 'fldAVLLqEtYQ96GGN',
    aucoCode: 'fldWk5LbJ2n7mzXzc', log: 'fldBrY6EFAbTzYdHM',
  },
};

// Quién firma por la empresa, según el arrendador o contratante del documento
const EMPRESAS = {
  cyc: { razon: 'C&C GROUP SAS', nit: '900.609.741-1', email: 'comercial@constructoraccgroup.com' },
  verse: { razon: 'VERSE GROUP SAS', nit: '901.861.647', email: 'felipe@verseliving.com' },
};
const REPRESENTANTE = 'Juan Felipe Tobar';

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function secreto(proposito) {
  if (!process.env.VERSE_API_TOKEN) throw new Error('Falta VERSE_API_TOKEN en Vercel');
  return crypto.createHash('sha256').update(`${process.env.VERSE_API_TOKEN}|${proposito}`).digest();
}
function secretoWebhook() { return secreto('auco-webhook').toString('hex'); }

// Tokens firmados (sesión del equipo y aprobación de revisión)
function firmar(obj, proposito) {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const s = crypto.createHmac('sha256', secreto(proposito)).update(p).digest('base64url');
  return `${p}.${s}`;
}
function verificar(token, proposito) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return null;
  const ok = crypto.createHmac('sha256', secreto(proposito)).update(p).digest('base64url');
  if (!safeEqual(s, ok)) return null;
  try {
    const obj = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch { return null; }
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

// Quién llama: la skill (Bearer VERSE_API_TOKEN) o alguien del equipo con sesión
function quien(req) {
  const t = process.env.VERSE_API_TOKEN;
  const h = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (t && h && safeEqual(h, t)) return { canal: 'Claude', nombre: 'Felipe (Claude)' };
  const s = verificar(cookies(req).vd_s, 'sesion');
  if (s) return { canal: 'Plataforma', nombre: s.u };
  return null;
}

async function leerBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

async function auco(path, { method = 'GET', body, privada = false } = {}) {
  const key = privada ? process.env.AUCO_PRK : process.env.AUCO_PUK;
  if (!key) throw new Error(`Falta la variable ${privada ? 'AUCO_PRK' : 'AUCO_PUK'} en Vercel`);
  const r = await fetch(`${AUCO_BASE}${path}`, {
    method,
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

async function airtable(path, { method = 'GET', body } = {}) {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) throw new Error('Falta la variable AIRTABLE_TOKEN en Vercel');
  const r = await fetch(`https://api.airtable.com/v0/${AT.base}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function ahora() { return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }); }

module.exports = {
  AUCO_BASE, AT, EMPRESAS, REPRESENTANTE, json, safeEqual, secretoWebhook, firmar, verificar,
  cookies, quien, leerBody, auco, airtable, sha256, ahora,
};
