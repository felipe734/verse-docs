// Página de firmas que se agrega al final del documento y posiciones para Auco
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const CAJA = { w: 210, h: 70 };

// Devuelve { pdfBase64, posiciones: [{page,x,y,w,h}, ...] } con una caja por firmante
async function agregarPaginaFirmas(pdfBase64, { titulo, hash, firmantes }) {
  const doc = await PDFDocument.load(Buffer.from(pdfBase64, 'base64'), { ignoreEncryption: false });
  const ultima = doc.getPage(doc.getPageCount() - 1);
  const { width: W, height: H } = ultima.getSize();
  const page = doc.addPage([W, H]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const azul = rgb(0.12, 0.16, 0.27);
  const gris = rgb(0.45, 0.47, 0.52);
  const izq = 60;

  page.drawText('PÁGINA DE FIRMAS', { x: izq, y: H - 80, size: 14, font: fb, color: azul });
  page.drawText(String(titulo || '').slice(0, 90), { x: izq, y: H - 102, size: 10, font: f, color: azul });
  page.drawText(`Huella del documento revisado (SHA-256): ${hash}`, { x: izq, y: H - 120, size: 6.5, font: f, color: gris });
  page.drawText('Las partes firman electrónicamente conforme a la Ley 527 de 1999 y el Decreto 2364 de 2012.', { x: izq, y: H - 134, size: 8, font: f, color: gris });

  const posiciones = [];
  firmantes.forEach((p, i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const left = izq + col * (CAJA.w + 50);
    const top = 190 + fila * 170;                  // distancia desde el borde superior
    const yPdf = H - top - CAJA.h;                 // pdf-lib mide desde abajo
    page.drawRectangle({ x: left, y: yPdf, width: CAJA.w, height: CAJA.h, borderColor: rgb(0.8, 0.82, 0.86), borderWidth: 0.8 });
    page.drawLine({ start: { x: left, y: yPdf - 6 }, end: { x: left + CAJA.w, y: yPdf - 6 }, thickness: 0.8, color: azul });
    page.drawText(String(p.rol || '').toUpperCase(), { x: left, y: yPdf - 20, size: 8.5, font: fb, color: azul });
    page.drawText(String(p.name || '').slice(0, 42), { x: left, y: yPdf - 33, size: 8.5, font: f, color: azul });
    if (p.detalle) page.drawText(String(p.detalle).slice(0, 48), { x: left, y: yPdf - 45, size: 7.5, font: f, color: gris });
    // Auco: x = (firmaX + ancho) / anchoPágina ; y = (firmaY + alto) / altoPágina, medidos desde arriba
    posiciones.push({
      page: doc.getPageCount(),
      x: Number(((left + CAJA.w) / W).toFixed(4)),
      y: Number(((top + CAJA.h) / H).toFixed(4)),
      w: CAJA.w,
      h: CAJA.h,
    });
  });
  const bytes = await doc.save();
  return { pdfBase64: Buffer.from(bytes).toString('base64'), posiciones };
}

module.exports = { agregarPaginaFirmas };
