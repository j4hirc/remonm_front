import { jsPDF } from 'jspdf';
import { autoTable, UserOptions } from 'jspdf-autotable';

export interface EvidenceReportData {
  clientName: string;
  address: string;
  buildingNumber: string;
  apartment: string;
  clientPhone: string;
  employeeName: string;
  status: string;
  comment: string;
  total: number;
  date: Date;
  materials: Array<{ name: string; quantity: number; unit: string; price: number }>;
  photos: File[];
  signature: string;
  logoUrl: string;
}

/** Decode one image at a time; never allocate a canvas for the entire report. */
async function readImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.onload = image.onerror = null;
      image.src = '';
      reject(new Error('La imagen tardó demasiado en cargar. Inténtalo de nuevo.'));
    }, 20000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('No se pudo leer una imagen. Conviértela a JPG o PNG y vuelve a intentar.'));
    };
    image.src = source;
  });
}

async function photoForPdf(file: File): Promise<{ data: string; ratio: number }> {
  const url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  let image: HTMLImageElement | undefined;
  try {
    image = await readImage(url);
    const ratio = image.naturalWidth / image.naturalHeight;
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la fotografía para el PDF.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.85), ratio };
  } finally {
    if (image) image.src = '';
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

/** A4 coordinates and native text: independent of viewport, scroll and CSS. */
export async function buildEvidenceReportPdf(data: EvidenceReportData): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const margin = 14;
  const width = pdf.internal.pageSize.getWidth();
  const bottom = pdf.internal.pageSize.getHeight() - 18;
  const contentWidth = width - 2 * margin;
  const navy = '#0F2D4A';
  const cyan = '#009EB8';
  const money = (value: number) => `$${value.toFixed(2)}`;
  // Helvetica supports Spanish; replace the application's warning emoji explicitly.
  const text = (value: string) => value.replace(/⚠️?/gu, '[!]');
  let y = margin;

  const ensureSpace = (height: number) => {
    if (y + height > bottom) {
      pdf.addPage();
      y = margin;
    }
  };
  const table = (options: UserOptions) => {
    autoTable(pdf, {
      startY: y,
      margin: { top: margin, right: margin, bottom: 18, left: margin },
      tableWidth: contentWidth,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak',
        textColor: navy, lineColor: '#DCE3E8', lineWidth: 0.2 },
      headStyles: { fillColor: navy, textColor: '#FFFFFF' },
      rowPageBreak: 'avoid',
      ...options,
      didDrawPage: (hook) => { y = hook.cursor?.y ?? margin; }
    });
    y += 6;
  };
  const heading = (label: string, followingHeight = 20) => {
    ensureSpace(10 + followingHeight);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(navy);
    pdf.text(label, margin, y + 5);
    y += 9;
  };

  let titleX = margin;
  // Branding is optional; an unavailable logo must not discard a signed report.
  try {
    const logo = await readImage(data.logoUrl);
    const logoWidth = Math.min(20, 15 * logo.naturalWidth / logo.naturalHeight);
    pdf.addImage(logo, 'PNG', margin, y, logoWidth, 15);
    titleX += logoWidth + 4;
  } catch { /* Keep the text header when the logo is unavailable. */ }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.setTextColor(navy);
  pdf.text('REPORTE DE OBRA', titleX, y + 6);
  pdf.setFontSize(9);
  pdf.setTextColor(cyan);
  pdf.text('Plataforma RemoMN', titleX, y + 12);
  pdf.setFontSize(8);
  pdf.setTextColor(navy);
  const date = `${String(data.date.getMonth() + 1).padStart(2, '0')}/${String(data.date.getDate()).padStart(2, '0')}/${data.date.getFullYear()}`;
  pdf.text(['Fecha de emisión', date], width - margin, y + 6, { align: 'right' });
  y += 20;
  pdf.setDrawColor(cyan);
  pdf.line(margin, y, width - margin, y);
  y += 6;
  table({
    body: [
      ['Proyecto / Contacto', text(data.clientName)], ['Dirección', text(data.address)],
      ['Edificio', text(data.buildingNumber)], ['Departamento', text(data.apartment)],
      ['Teléfono Contacto', data.clientPhone], ['Subcontratista', text(data.employeeName)],
      ['Valor a Pagar', money(data.total)],
      ['Estado Reportado', data.status === 'REVIEW' ? 'REVISIÓN' : data.status === 'COMPLETED' ? 'COMPLETADO' : 'EN PROGRESO']
    ],
    columnStyles: { 0: { cellWidth: 45, fillColor: navy, textColor: '#FFFFFF', fontStyle: 'bold' },
      1: { cellWidth: contentWidth - 45 } }
  });

  heading('Comentarios del Avance');
  table({ body: [[text(data.comment) || 'Sin comentarios.']],
    bodyStyles: { fillColor: '#F8FAFC' } });
  if (data.status === 'COMPLETED') {
    ensureSpace(30);
    table({ body: [['CERTIFICACIÓN DE GARANTÍA: El subcontratista certifica que el proyecto está terminado y los errores encontrados después de terminar el proyecto serán cobrados al subcontratista como garantías del trabajo.']],
      bodyStyles: { fillColor: '#EDF9FB', fontStyle: 'bold' } });
  }

  heading('Materiales Utilizados', 28);
  table({
    head: [['Material', 'Cantidad', 'Precio Unit.', 'Subtotal']],
    body: data.materials.length ? data.materials.map((m) => [
      text(m.name), `${m.quantity}${m.unit ? ' ' + m.unit : ''}`, money(m.price), money(m.quantity * m.price)
    ]) : [[{ content: 'No se reportaron materiales.', colSpan: 4 }]],
    columnStyles: {
      0: { cellWidth: contentWidth - 90 },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 31, halign: 'right' },
      3: { cellWidth: 31, halign: 'right', textColor: '#198754', fontStyle: 'bold' }
    },
    didParseCell: (hook) => {
      if (hook.section === 'head' && hook.column.index > 0) {
        hook.cell.styles.halign = hook.column.index === 1 ? 'center' : 'right';
      }
    },
    showHead: 'everyPage'
  });
  ensureSpace(26);
  table({ body: [
    ['Total Materiales', money(data.materials.reduce((sum, m) => sum + m.quantity * m.price, 0))],
    ['TOTAL A PAGAR', money(data.total)]
  ], bodyStyles: { fillColor: navy, textColor: '#FFFFFF', fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: contentWidth - 40 }, 1: { cellWidth: 40, halign: 'right' } } });

  heading('Evidencias Fotográficas', data.photos.length ? 65 : 10);
  if (!data.photos.length) {
    table({ body: [['Sin fotografías.']] });
  }
  const cellWidth = (contentWidth - 6) / 2;
  for (let index = 0; index < data.photos.length; index++) {
    if (index % 2 === 0) ensureSpace(65);
    const photo = await photoForPdf(data.photos[index]);
    const photoWidth = Math.min(cellWidth - 4, 55 * photo.ratio);
    const photoHeight = photoWidth / photo.ratio;
    const x = margin + (index % 2) * (cellWidth + 6);
    pdf.addImage(photo.data, 'JPEG', x + (cellWidth - photoWidth) / 2,
      y + (55 - photoHeight) / 2, photoWidth, photoHeight);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(navy);
    pdf.text(`Foto ${index + 1}`, x + cellWidth / 2, y + 60, { align: 'center' });
    if (index % 2 === 1 || index === data.photos.length - 1) y += 65;
  }
  ensureSpace(40);
  if (data.signature) {
    const signature = pdf.getImageProperties(data.signature);
    const signatureWidth = Math.min(70, 23 * signature.width / signature.height);
    pdf.addImage(data.signature, 'PNG', (width - signatureWidth) / 2, y + 3,
      signatureWidth, signatureWidth * signature.height / signature.width);
  }
  pdf.setDrawColor(navy);
  pdf.line(width / 2 - 40, y + 28, width / 2 + 40, y + 28);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(navy);
  pdf.text('SUBCONTRATISTA', width / 2, y + 34, { align: 'center' });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor('#64748B');
    pdf.text(`Página ${page} de ${pages}`, width - margin, bottom + 9, { align: 'right' });
  }
  return pdf.output('blob');
}
