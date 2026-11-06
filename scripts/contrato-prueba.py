# Genera un PDF de prueba a partir de un modelo, llenando los campos {{ }}.
#   python3 scripts/contrato-prueba.py modelos/vl-coliving.txt salida.pdf campos.json
import json, re, sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from xml.sax.saxutils import escape

modelo, salida, campos = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
texto = open(modelo, encoding='utf-8').read().split('---\n', 1)[1]
faltan = set(re.findall(r'{{([A-Z_]+)}}', texto)) - set(campos)
if faltan:
    sys.exit('Faltan campos: ' + ', '.join(sorted(faltan)))
texto = re.sub(r'{{([A-Z_]+)}}', lambda m: str(campos[m.group(1)]), texto)

st = getSampleStyleSheet()
normal = ParagraphStyle('n', parent=st['Normal'], fontName='Helvetica', fontSize=9.5, leading=12.5)
titulo = ParagraphStyle('t', parent=normal, fontName='Helvetica-Bold', fontSize=12, leading=15, alignment=1)
flujo, bloque = [], []

def soltar():
    if bloque:
        flujo.append(Paragraph(escape(' '.join(bloque)), normal))
        flujo.append(Spacer(1, 5))
        bloque.clear()

negrita = ParagraphStyle('b', parent=normal, fontName='Helvetica-Bold', spaceBefore=4)
condiciones = True
for i, l in enumerate(texto.splitlines()):
    l = l.strip()
    if not l:
        soltar(); continue
    if i < 2:
        flujo.append(Paragraph(escape(l), titulo)); continue
    if l == 'PARTES':
        condiciones = False
    es_titulo = re.fullmatch(r'(\d+\.\s+)?[A-ZÁÉÍÓÚÑ ,&]+', l) is not None
    if es_titulo:
        soltar(); flujo.append(Paragraph(escape(l), negrita)); continue
    if condiciones and l[0].isupper():
        soltar()
    bloque.append(l)
soltar()
SimpleDocTemplate(salida, pagesize=letter, leftMargin=60, rightMargin=60, topMargin=55, bottomMargin=55,
                  title='Contrato de prueba').build(flujo)
print('ok', salida)
