// Utilidades compartidas de verse-docs (Vercel Functions, Node 22, sin dependencias)
const crypto = require('crypto');

const AUCO_BASE = process.env.AUCO_ENV === 'prod'
  ? 'https://api.auco.ai/v1.5/ext'
  : 'https://dev.auco.ai/v1.5/ext';

// Airtable 9. LIVING
const AT = {
  base: 'appzaNZaaYKfdZObP',
  contrato: 'tblxQ4njsGL6uyAe3',
  unidades: 'tblp0bqTnMi0LTezh',
  f: {
    contratoUnidad: 'fldwDfCdi5tOlKKyO',
    contratoEstado: 'fldeiURO8INV2Co3n',
    aucoCode: 'fldUb57xbrcs2o1J6',
    aucoEstado: 'fldTV3FaGLOnnrJCA',
    unidadContratoArriendo: 'fldgPCGslk9pkp37e',
  },
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Solo quien tenga VERSE_API_TOKEN puede usar la API
function autorizado(req) {
  const t = process.env.VERSE_API_TOKEN;
  const h = req.headers.authorization || '';
  return Boolean(t) && safeEqual(h.replace(/^Bearer\s+/i, ''), t);
}

// Secreto del webhook derivado del token: no hay que guardar otra variable
function secretoWebhook() {
  return crypto.createHash('sha256').update(`${process.env.VERSE_API_TOKEN}|auco-webhook`).digest('hex');
}

async function leerBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
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

module.exports = { AUCO_BASE, AT, json, autorizado, secretoWebhook, safeEqual, leerBody, auco, airtable };
