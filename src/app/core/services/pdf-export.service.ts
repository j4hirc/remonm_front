import { Injectable } from '@angular/core';
import { saveAs } from 'file-saver';

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  async create(element: HTMLElement, filename: string): Promise<Blob> {
    const { default: html2pdf } = await import('html2pdf.js');
    await document.fonts.ready;
    // Solo lectura del contenido renderizado por Angular, nunca innerHTML.
    await Promise.all(Array.from(element.querySelectorAll('img')).map(async image => {
      if (!image.complete) await image.decode();
      if (image.naturalWidth === 0) throw new Error('No se pudo cargar el logo del PDF. Revisa public/img/logonegro.png.');
    }));
    return html2pdf().set({
      margin: [15, 15, 15, 15], filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2.5, useCORS: true, logging: false, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h1', 'h2', 'li'] }
    }).from(element).outputPdf('blob');
  }
  download(blob: Blob, filename: string): void {
    // FileSaver encapsula la descarga. No construimos nodos manualmente.
    saveAs(blob, filename);
  }
  isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
}
