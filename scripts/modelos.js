// Genera modelos/index.js a partir de los .txt de modelos/ (correr después de sincronizar desde Drive):
//   node scripts/modelos.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'modelos');
const out = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
  const texto = fs.readFileSync(path.join(dir, f), 'utf8');
  const meta = {};
  for (const l of texto.split('---')[0].split('\n')) { const m = l.match(/^([A-Z_]+):\s*(.*)$/); if (m) meta[m[1]] = m[2].trim(); }
  out[f.replace(/\.txt$/, '')] = { ...meta, texto };
}
fs.writeFileSync(path.join(dir, 'index.js'), '// Generado por scripts/modelos.js. No editar a mano.\nmodule.exports = ' + JSON.stringify(out, null, 1) + ';\n');
console.log('Modelos:', Object.keys(out).join(', '));
