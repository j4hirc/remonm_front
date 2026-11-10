import { Job, JobUpdate } from '../../models/job.model';
import { escapeLocationHtml as escape, jobLocation } from '../../utils/job-location';
import { formatDay, parseJobDay } from '../../utils/report-calculations';
import { lineTotal } from './report-material-comparison';

function day(value?: string | number[] | null): number | null {
  if (!value) return null;
  return parseJobDay(typeof value === 'string' ? value.slice(0, 10) : value);
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function buildInvoiceElement(job: Job): HTMLElement {
  const updates = [...(job.updateJob ?? [])].sort((a, b) =>
    (day(b.date) ?? -1) - (day(a.date) ?? -1) || b.jobUpdateId - a.jobUpdateId);
  const report: JobUpdate | undefined = updates[0];

  // 1. Preferir SIEMPRE los materiales actuales del trabajo (los que editas/agregas)
  // 2. Solo si el trabajo no tiene materiales, usar el snapshot del reporte
  const jobMaterials = (job.materials ?? [])
    .map(m => ({
      ...m,
      quantity: m.quantity ?? 1,
      unitPrice: (m as any).price ?? (m as any).unitPrice ?? (m as any).estimatedPrice ?? 0
    }))
    .filter(m => m.quantity > 0);

  const snapshot = report?.materialSnapshotAvailable !== false
    ? report?.reportedMaterials
    : undefined;

  const rows = jobMaterials.length > 0
    ? jobMaterials
    : (snapshot ?? []).filter((m: any) => (m.quantity ?? 0) > 0);

  const completed = day(job.completedDate);
  const reported = day(report?.date);
  const date = completed ?? reported ?? day(job.jobDate);
  const dateLabel = completed !== null ? 'Fecha de finalización' :
    reported !== null ? 'Fecha del reporte' : 'Fecha programada';

  // Título según de dónde salieron los datos
  const title = jobMaterials.length > 0
    ? 'Materiales registrados en el trabajo'
    : 'Materiales utilizados';

  const cell = 'padding:8px 5px;border-bottom:1px solid #d8e2e8;';
  const amounts = rows.map(m => lineTotal(m.quantity, m.unitPrice));
  const total = amounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0) / 100;
  const element = document.createElement('div');
  element.style.cssText = 'font:14px Arial,sans-serif;color:#183346;background:white;overflow-wrap:anywhere;';
  element.innerHTML = `
    <div style="border-bottom:3px solid #15516b;padding-bottom:14px;">
      <img src="img/logonegro.png" alt="Rojas Remodeling" style="max-width:140px;max-height:60px;">
      <h1 style="margin:14px 0 4px;font-size:26px;">Nota de venta</h1>
      <strong>RemoMN · Trabajo #${job.jobId}</strong>
    </div>
    <p><strong>${dateLabel}</strong> · ${date === null ? 'Sin fecha registrada' : formatDay(date)}</p>
    <p><strong>Cliente</strong> · ${escape(job.clientName || 'Sin registrar')}<br>
      ${escape(jobLocation(job))}${job.clientPhone ? '<br>' + escape(job.clientPhone) : ''}</p>
    ${job.quickbooksInvoice ? '<p>Referencia QuickBooks · ' + escape(job.quickbooksInvoice) + '</p>' : ''}
    <h2 style="font-size:17px;margin-top:24px;">${title}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead style="background:#183346;color:white;"><tr>
        ${['Material', 'Cantidad', 'Unidad', 'Precio unit.', 'Importe'].map((label, i) =>
          `<th style="${cell}text-align:${i === 0 ? 'left' : 'right'};">${label}</th>`).join('')}
      </tr></thead>
      <tbody>${rows.map((m, i) => `<tr style="text-align:right;">
        <td style="${cell}text-align:left;">${escape(m.name || 'Material')}</td>
        <td style="${cell}">${m.quantity}</td><td style="${cell}">${escape(m.unit || '—')}</td>
        <td style="${cell}">${money.format(m.unitPrice)}</td><td style="${cell}">${money.format(amounts[i])}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="padding:12px 0;">Sin materiales registrados con cantidad mayor a cero.</td></tr>'}</tbody>
    </table>
    <p style="text-align:right;font-size:18px;font-weight:bold;">Total de materiales (USD) · ${money.format(total)}</p>`;
  return element;
}