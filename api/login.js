// POST /api/login { nombre, password } — ingreso del equipo con la contraseña TEAM_PASSWORD
// DELETE /api/login — cerrar sesión
const { json, firmar, leerBody, safeEqual, quien } = require('../lib/util');

const HORAS = 12;

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const q = quien(req);
    return json(res, q ? 200 : 401, q ? { ok: true, nombre: q.nombre } : { ok: false });
  }
  if (req.method === 'DELETE') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'vd_s=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
  const { nombre, password } = await leerBody(req);
  const clave = process.env.TEAM_PASSWORD;
  if (!clave) return json(res, 500, { error: 'Falta TEAM_PASSWORD en Vercel' });
  const n = String(nombre || '').trim().slice(0, 60);
  if (!n || !safeEqual(password, clave)) {
    await new Promise((r) => setTimeout(r, 1200));
    return json(res, 401, { error: 'Nombre o contraseña incorrectos' });
  }
  const token = firmar({ u: n, exp: Date.now() + HORAS * 3600e3 }, 'sesion');
  return json(res, 200, { ok: true, nombre: n }, {
    'Set-Cookie': `vd_s=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${HORAS * 3600}`,
  });
};
