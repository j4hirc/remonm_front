import { Injectable } from '@angular/core';
import { Job } from '../models/job.model';
import { buildInvoiceElement } from './utils/invoice-template';


declare const html2pdf: any;

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  canGenerate(job: Job): boolean {
    return !!job.quickbooksInvoice && job.status === 'COMPLETED';
  }

  async download(job: Job): Promise<void> {
    if (!this.canGenerate(job)) {
      throw new Error(
        'Solo se puede generar la factura si el trabajo está Completado y tiene número de QuickBooks.'
      );
    }
    if (typeof html2pdf === 'undefined') {
      throw new Error('html2pdf no está cargado.');
    }

    const element = buildInvoiceElement(job);
    const invoice = job.quickbooksInvoice || 'Sin_numero';
    const safeName = (job.clientName || 'Trabajo').replace(/[^a-zA-Z0-9]/g, '_');

    const opt = {
      margin: [12, 12, 12, 12],
      filename: `Factura_QB_${invoice}_${safeName}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(element).save();
  }
}