import { jsPDF } from 'jspdf';
import { autoTable, UserOptions } from 'jspdf-autotable';
import { lineTotal } from './report-material-comparison';

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
  initialTotal: number | null;
  originalAssignmentAvailable: boolean;
  date: Date;
  materials: Array<{
    name: string;
    quantity: number;
    unit: string;
    price: number;
    initialQuantity: number | null;
    initialUnitPrice: number | null;
    changed: boolean;
  }>;
  photos: File[];
  signature: string;
  logoUrl: string;
}

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
      reject(
        new Error('No se pudo leer una imagen. Conviértela a JPG o PNG y vuelve a intentar.')
      );
    };

    image.src = source;
  });
}

/** Procesa una foto por vez para limitar el uso de memoria en el celular. */
async function preparePhoto(file: File): Promise<{ jpeg: Blob; ratio: number }> {
  const url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  let image: HTMLImageElement | undefined;

  try {
    image = await readImage(url);

    const ratio = image.naturalWidth / image.naturalHeight;
    const scale = Math.min(
      1,
      1200 / Math.max(image.naturalWidth, image.naturalHeight)
    );

    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No se pudo preparar la fotografía para el PDF.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob?.type === 'image/jpeg') {
          resolve(blob);
        } else {
          reject(new Error('No se pudo convertir la fotografía a JPG.'));
        }
      }, 'image/jpeg', 0.85);
    });

    return { jpeg, ratio };
  } finally {
    if (image) image.src = '';
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

export async function buildEvidenceReportPdf(
  data: EvidenceReportData
): Promise<{ pdfBlob: Blob; photos: File[] }> {
  const photos: File[] = [];
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true
  });

  const margin = 14;
  const width = pdf.internal.pageSize.getWidth();
  const bottom = pdf.internal.pageSize.getHeight() - 18;
  const contentWidth = width - 2 * margin;
  const navy = '#0F2D4A';
  const cyan = '#009EB8';
  const money = (value: number) => `$${value.toFixed(2)}`;
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
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 3,
        overflow: 'linebreak',
        textColor: navy,
        lineColor: '#DCE3E8',
        lineWidth: 0.2
      },
      headStyles: { fillColor: navy, textColor: '#FFFFFF' },
      rowPageBreak: 'avoid',
      ...options,
      didDrawPage: hook => {
        y = hook.cursor?.y ?? margin;
      }
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

  try {
    const logo = await readImage(data.logoUrl);
    const logoWidth = Math.min(20, 15 * logo.naturalWidth / logo.naturalHeight);
    pdf.addImage(logo, 'PNG', margin, y, logoWidth, 15);
    titleX += logoWidth + 4;
  } catch {
    // Si el logo no carga, el reporte firmado se genera con el encabezado de texto.
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.setTextColor(navy);
  pdf.text('REPORTE DE OBRA', titleX, y + 6);
  pdf.setFontSize(9);
  pdf.setTextColor(cyan);
  pdf.text('Plataforma RemoMN', titleX, y + 12);
  pdf.setFontSize(8);
  pdf.setTextColor(navy);

  const date =
    `${String(data.date.getMonth() + 1).padStart(2, '0')}/` +
    `${String(data.date.getDate()).padStart(2, '0')}/` +
    `${data.date.getFullYear()}`;

  pdf.text(['Fecha de emisión', date], width - margin, y + 6, { align: 'right' });
  y += 20;
  pdf.setDrawColor(cyan);
  pdf.line(margin, y, width - margin, y);
  y += 6;

  table({
    body: [
      ['Proyecto / Contacto', text(data.clientName)],
      ['Dirección', text(data.address)],
      ['Edificio', text(data.buildingNumber)],
      ['Departamento', text(data.apartment)],
      ['Teléfono Contacto', data.clientPhone],
      ['Subcontratista', text(data.employeeName)],
      ['Valor a Pagar', money(data.total)],
      [
        'Estado Reportado',
        data.status === 'REVIEW'
          ? 'REVISIÓN'
          : data.status === 'COMPLETED'
            ? 'COMPLETADO'
            : 'En Progreso (Pago)'
      ]
    ],
    columnStyles: {
      0: { cellWidth: 45, fillColor: navy, textColor: '#FFFFFF', fontStyle: 'bold' },
      1: { cellWidth: contentWidth - 45 }
    }
  });

  heading('Comentarios del Avance');
  table({
    body: [[text(data.comment) || 'Sin comentarios.']],
    bodyStyles: { fillColor: '#F8FAFC' }
  });

  if (data.status === 'COMPLETED') {
    ensureSpace(30);
    table({
      body: [[
        'CERTIFICACIÓN DE GARANTÍA: El subcontratista certifica que el proyecto está terminado y los errores encontrados después de terminar el proyecto serán cobrados al subcontratista como garantías del trabajo.'
      ]],
      bodyStyles: { fillColor: '#EDF9FB', fontStyle: 'bold' }
    });
  }

  heading('Materiales: asignación inicial y reporte', 28);

  if (!data.originalAssignmentAvailable) {
    table({
      body: [['Inicial no disponible: este trabajo no tiene una asignación original registrada.']],
      bodyStyles: { fillColor: '#FFF4DA' }
    });
  }

  table({
    head: [[
      'Material',
      'Cant. inicial',
      'Cant. reportada',
      'Precio unit.',
      'Total inicial',
      'Total actualizado'
    ]],
    body: data.materials.length
      ? data.materials.map(m => [
          text(m.name) + (m.unit ? ` (${m.unit})` : '') + (m.changed ? ' - Modificado' : ''),
          m.initialQuantity === null ? 'N/D' : String(m.initialQuantity),
          String(m.quantity),
          money(m.price),
          m.initialQuantity === null || m.initialUnitPrice === null
            ? 'N/D'
            : money(lineTotal(m.initialQuantity, m.initialUnitPrice)),
          money(lineTotal(m.quantity, m.price))
        ])
      : [[{ content: 'No se reportaron materiales.', colSpan: 6 }]],
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak',
      textColor: navy,
      lineColor: '#DCE3E8',
      lineWidth: 0.2
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 120 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 27, halign: 'right' },
      5: { cellWidth: 27, halign: 'right', textColor: '#198754', fontStyle: 'bold' }
    },
    didParseCell: hook => {
      if (hook.section === 'body' && data.materials[hook.row.index]?.changed) {
        hook.cell.styles.fillColor = '#FFF4DA';
      }
    },
    showHead: 'everyPage'
  });

  ensureSpace(38);
  const initialLabel = data.initialTotal === null ? 'No disponible' : money(data.initialTotal);

  table({
    body: [
      ['PRECIO INICIAL DEL TRABAJO', initialLabel],
      ['PRECIO ACTUALIZADO', money(data.total)],
      [
        'DIFERENCIA',
        data.initialTotal === null ? 'No disponible' : money(data.total - data.initialTotal)
      ]
    ],
    bodyStyles: { fillColor: navy, textColor: '#FFFFFF', fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: contentWidth - 45 },
      1: { cellWidth: 45, halign: 'right' }
    }
  });

  heading('Evidencias Fotográficas', data.photos.length ? 65 : 10);

  if (!data.photos.length) {
    table({ body: [['Sin fotografías.']] });
  }

  const cellWidth = (contentWidth - 6) / 2;

  for (let index = 0; index < data.photos.length; index++) {
    if (index % 2 === 0) ensureSpace(65);

    const original = data.photos[index];
    let photo: { jpeg: Blob; ratio: number };

    try {
      photo = await preparePhoto(original);
    } catch {
      throw new Error(
        `No se pudo procesar la foto ${index + 1} (${original.name}). ` +
        'Prueba una copia JPG o PNG de menor tamaño.'
      );
    }

    // Para la subida, conservar el original si ya pesa menos.
    const attachment = photo.jpeg.size < original.size
      ? new File([photo.jpeg], original.name.replace(/\.[^.]+$/, '') + '.jpg', {
          type: 'image/jpeg',
          lastModified: original.lastModified
        })
      : original;

    photos.push(attachment);

    const photoWidth = Math.min(cellWidth - 4, 55 * photo.ratio);
    const photoHeight = photoWidth / photo.ratio;
    const x = margin + (index % 2) * (cellWidth + 6);

    pdf.addImage(
      new Uint8Array(await photo.jpeg.arrayBuffer()),
      'JPEG',
      x + (cellWidth - photoWidth) / 2,
      y + (55 - photoHeight) / 2,
      photoWidth,
      photoHeight
    );

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
    pdf.addImage(
      data.signature,
      'PNG',
      (width - signatureWidth) / 2,
      y + 3,
      signatureWidth,
      signatureWidth * signature.height / signature.width
    );
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
    pdf.text(`Página ${page} de ${pages}`, width - margin, bottom + 9, {
      align: 'right'
    });
  }

  return { pdfBlob: pdf.output('blob'), photos };
} 