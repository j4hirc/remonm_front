import { inject, Injectable } from '@angular/core';
import { Job } from '../models/job.model';
import { PdfExportService } from './pdf-export.service';
import { buildInvoiceElement } from './utils/invoice-template';

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  private readonly pdf = inject(PdfExportService);

  async download(job: Job): Promise<void> {
    const filename = `Nota_de_venta_RemoMN_${job.jobId}.pdf`;
    const blob = await this.pdf.create(buildInvoiceElement(job), filename);
    this.pdf.download(blob, filename);
  }
}
