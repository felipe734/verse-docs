// POST /api/auco/registrar-webhook — registra en Auco el webhook "default" apuntando a este servicio,
// con el encabezado secreto. Correr una vez por ambiente (stage y prod). Sesión del equipo o Bearer.
// No devuelve la respuesta de Auco completa para no exponer el valor del encabezado.
const { json, quien, auco, secretoWebhook } = require('../../lib/util');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
  if (!quien(req)) return json(res, 401, { error: 'No autorizado' });
  const host = process.env.PUBLIC_HOST || req.headers.host;
  const url = `https://${host}/api/auco/webhook`;
  try {
    const r = await auco('/company', {
      method: 'PUT', privada: true,
      body: { webhooks: [{ id: 'default', description: 'verse-docs', url, header: { key: 'x-verse-webhook', value: secretoWebhook() } }] },
    });
    const err = r.ok ? null : (r.data && (r.data.message || r.data.error)) || 'Auco rechazó';
    return json(res, r.ok ? 200 : 502, { ok: r.ok, url, error: err });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
