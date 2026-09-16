import { jobLocation, escapeLocationHtml } from '../../utils/job-location';
import { Job } from "../../models/job.model";


function formatDate(fecha: string | number[] | null | undefined): string {
  if (!fecha) return 'Sin fecha';
  if (Array.isArray(fecha)) {
    const [y, m, d] = fecha;
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
  }
  const parts = String(fecha).split('-');
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
  return String(fecha);
}

/** Devuelve un elemento DOM listo para html2pdf */
export function buildInvoiceElement(job: Job): HTMLElement {
  const fecha = formatDate(job.jobDate);
  const invoice = job.quickbooksInvoice || 'Sin número';
  const pay = Number(job.pay || 0).toFixed(2);

  const el = document.createElement('div');
  el.style.cssText =
    'padding:40px;font-family:Poppins,Arial,sans-serif;color:#1e293b;background:white;width:700px;';

  el.innerHTML = `
    <div style="text-align:center;border-bottom:3px solid #0f4c81;padding-bottom:20px;margin-bottom:30px;">
      <h1 style="margin:0;color:#0f4c81;font-size:28px;">RemoMN</h1>
      <p style="margin:8px 0 0;color:#64748b;font-size:14px;">Documento de Factura / Invoice</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:25px;">
      <tr>
        <td style="padding:8px 0;width:40%;color:#64748b;">Número de Invoice QuickBooks:</td>
        <td style="padding:8px 0;font-weight:700;font-size:18px;color:#0f4c81;">${invoice}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;">Fecha del Trabajo:</td>
        <td style="padding:8px 0;font-weight:600;">${fecha}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;">Estado:</td>
        <td style="padding:8px 0;font-weight:600;">${job.status}</td>
      </tr>
    </table>
    <div style="background:#f8fafc;padding:20px;border-radius:10px;margin-bottom:25px;">
      <h3 style="margin:0 0 15px;color:#0f4c81;font-size:16px;">Datos del Cliente</h3>
      <p style="margin:6px 0;"><strong>Cliente:</strong> ${job.clientName}</p>
      <p style="margin:6px 0;"><strong>Teléfono:</strong> ${job.clientPhone || 'No registrado'}</p>
      <p style="margin:6px 0;"><strong>Dirección:</strong> ${escapeLocationHtml(jobLocation(job))}</p>
    </div>
    <div style="background:#f8fafc;padding:20px;border-radius:10px;margin-bottom:25px;">
      <h3 style="margin:0 0 15px;color:#0f4c81;font-size:16px;">Asignación</h3>
      <p style="margin:6px 0;"><strong>Subcontratista:</strong> ${job.nameEmployee || 'Sin asignar'}</p>
      <p style="margin:6px 0;"><strong>Manager:</strong> ${job.nameManager || 'Sin asignar'}</p>
      <p style="margin:6px 0;"><strong>Pago:</strong>
        <span style="font-size:18px;font-weight:700;color:#198754;">$${pay}</span>
      </p>
    </div>
    <div style="margin-top:40px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:15px;">
      Documento generado automáticamente · RemoMN
    </div>
  `;

  return el;
}