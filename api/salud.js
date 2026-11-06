// GET /api/salud — verifica qué variables están cargadas (sin mostrar valores)
const { json, AUCO_BASE } = require('../lib/util');

module.exports = (req, res) => {
  const vars = ['AUCO_PUK', 'AUCO_PRK', 'AIRTABLE_TOKEN', 'VERSE_API_TOKEN', 'ANTHROPIC_API_KEY', 'TEAM_PASSWORD', 'FIRMANTE_CELULAR'];
  json(res, 200, {
    servicio: 'verse-docs',
    ambiente: process.env.AUCO_ENV === 'prod' ? 'prod' : 'stage',
    auco: AUCO_BASE,
    variables: Object.fromEntries(vars.map((v) => [v, Boolean(process.env[v])])),
  });
};
