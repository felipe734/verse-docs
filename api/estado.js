// GET /api/estado?code=XXXX — estado del proceso en Auco (sin imágenes de identidad)
const { json, quien, auco } = require('../lib/util');

module.exports = async (req, res) => {
  if (!quien(req)) return json(res, 401, { error: 'No autorizado' });
  const code = new URL(req.url, 'http://x').searchParams.get('code');
  if (!code) return json(res, 400, { error: 'Falta code' });
  try {
    const r = await auco(`/document?code=${encodeURIComponent(code)}`);
    if (!r.ok) return json(res, r.status, { error: 'Auco', auco: r.data });
    const d = r.data;
    return json(res, 200, {
      code: d.code, name: d.name, status: d.status, pdf: d.url,
      firmantes: (d.signProfile || []).map((s) => ({ id: s.id, name: s.name, email: s.email, status: s.status })),
      custom: d.custom || null,
    });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
