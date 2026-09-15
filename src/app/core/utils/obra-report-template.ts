export interface ObraReportMaterial {
    name: string;
    quantityLabel: string;
    unitPrice: number;
    subtotal: number;
}

export interface ObraReportData {
    clientName: string;
    address: string;
    clientPhone: string;
    employeeName: string;
    totalPay: number;
    statusLabel: string;
    comment: string;
    showGuarantee: boolean;
    materials: ObraReportMaterial[];
    photoDataUrls: string[];
    signatureDataUrl: string;
    issueDate?: string;
}

function escapeHtml(text: string): string {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function todayLabel(): string {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Réplica fiel (misma estructura, colores y paddings) de la plantilla
 * #pdfTemplate del HTML original (employee-dashboard.html). Se mantiene
 * la misma interfaz ObraReportData para no tener que tocar
 * reporte.component.ts.
 */
export function buildObraReportElement(data: ObraReportData): HTMLElement {
    const fecha = data.issueDate || todayLabel();
    const total = Number(data.totalPay || 0).toFixed(2);

    const materialRows =
        data.materials.length > 0
            ? data.materials
                .map(
                    (m) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;color:#2E3238;">${escapeHtml(m.name)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;color:#2E3238;">${escapeHtml(m.quantityLabel)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;color:#2E3238;">$${m.unitPrice.toFixed(2)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:#198754;">$${m.subtotal.toFixed(2)}</td>
        </tr>`
                )
                .join('')
            : `<tr><td colspan="4" style="padding:8px;border:1px solid #ddd;text-align:center;color:#666;">No se reportaron materiales.</td></tr>`;

    const photosHtml =
        data.photoDataUrls.length > 0
            ? data.photoDataUrls
                .map(
                    (src) => `
        <div style="display:inline-block;width:210px;margin:8px;page-break-inside:avoid;border:1px solid #E2E8F0;border-radius:8px;padding:5px;background:#ffffff;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
          <img src="${src}" style="width:100%;height:140px;object-fit:cover;border-radius:6px;" />
        </div>`
                )
                .join('')
            : `<p style="color:#666;font-size:13px;">Sin evidencias fotográficas.</p>`;

    const guaranteeHtml = data.showGuarantee
        ? `
    <div style="display:block;background:rgba(18,207,244,0.05);padding:15px;border:1.5px solid #12CFF4;border-radius:8px;margin-bottom:20px;page-break-inside:avoid;">
      <p style="margin:0;font-size:12px;color:#0F2D4A;font-weight:bold;text-align:justify;">
        ✓ CERTIFICACIÓN DE GARANTÍA: El subcontratista certifica que el proyecto está terminado y los errores encontrados después de terminar el proyecto serán cobrados al subcontratista como garantías del trabajo.
      </p>
    </div>`
        : '';

    const el = document.createElement('div');
    el.style.cssText =
        "width:750px;margin:0;padding:20px 30px;font-family:'Helvetica',sans-serif;color:#0B0B0D;background:#ffffff;box-sizing:border-box;";

    el.innerHTML = `
    <!-- HEADER -->
    <table style="width:100%;border-collapse:collapse;border-bottom:3px solid #12CFF4;margin-bottom:25px;">
      <tr>
        <td style="vertical-align:bottom;padding-bottom:15px;">
          <table style="border-collapse:collapse;">
            <tr>
              <td style="padding-right:15px;vertical-align:middle;">
                <img src="/img/logonegro.png" style="max-height:55px;width:auto;object-fit:contain;" alt="Logo" onerror="this.style.display='none'" />
              </td>
              <td style="vertical-align:middle;">
                <h1 style="color:#0F2D4A;margin:0;font-size:24px;font-weight:bold;text-transform:uppercase;letter-spacing:-0.5px;">REPORTE DE OBRA</h1>
                <p style="margin:2px 0 0 0;color:#12CFF4;font-size:13px;font-weight:bold;letter-spacing:1px;">Plataforma RemoMN</p>
              </td>
            </tr>
          </table>
        </td>
        <td style="text-align:right;vertical-align:bottom;padding-bottom:15px;color:#2E3238;font-size:13px;">
          <div style="display:inline-block;text-align:left;">
            <p style="margin:0;font-weight:bold;">Fecha de Emisión:</p>
            <p style="margin:2px 0 0 0;font-size:15px;color:#12CFF4;font-weight:bold;">${fecha}</p>
          </div>
        </td>
      </tr>
    </table>

    <!-- INFO TABLE -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;page-break-inside:avoid;">
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#0F2D4A;color:#FFFFFF;font-weight:bold;width:25%;">Proyecto / Contacto:</td>
        <td style="padding:10px;border:1px solid #ddd;font-weight:bold;color:#0F2D4A;">${escapeHtml(data.clientName)}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#0F2D4A;color:#FFFFFF;font-weight:bold;">Dirección:</td>
        <td style="padding:10px;border:1px solid #ddd;color:#2E3238;">${escapeHtml(data.address || '—')}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#0F2D4A;color:#FFFFFF;font-weight:bold;">Teléfono Contacto:</td>
        <td style="padding:10px;border:1px solid #ddd;color:#2E3238;">${escapeHtml(data.clientPhone || '—')}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#0F2D4A;color:#FFFFFF;font-weight:bold;">Subcontratista:</td>
        <td style="padding:10px;border:1px solid #ddd;color:#2E3238;">${escapeHtml(data.employeeName)}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:#0F2D4A;color:#FFFFFF;font-weight:bold;">Valor a Pagar:</td>
        <td style="padding:10px;border:1px solid #ddd;color:#F4A300;font-size:16px;font-weight:bold;">$${total}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #ddd;background:rgba(18,207,244,0.1);font-weight:bold;color:#0F2D4A;">Estado Reportado:</td>
        <td style="padding:10px;border:1px solid #ddd;color:#12CFF4;font-weight:bold;text-transform:uppercase;">${escapeHtml(data.statusLabel)}</td>
      </tr>
    </table>

    <!-- COMENTARIOS -->
    <h3 style="page-break-after:avoid;color:#0F2D4A;font-size:16px;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:5px;">Comentarios del Avance</h3>
    <div style="background:#F8FAFC;padding:15px;border-left:4px solid #12CFF4;margin-bottom:20px;font-size:13px;line-height:1.5;white-space:pre-wrap;color:#2E3238;">${escapeHtml(data.comment || '—')}</div>

    ${guaranteeHtml}

    <!-- MATERIALES -->
    <h3 style="page-break-after:avoid;color:#0F2D4A;font-size:16px;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:5px;">Materiales Utilizados</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:15px;font-size:12px;page-break-inside:avoid;">
      <thead>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;background:#0F2D4A;color:#fff;font-weight:bold;">Material</td>
          <td style="padding:8px;border:1px solid #ddd;background:#0F2D4A;color:#fff;font-weight:bold;text-align:center;">Cantidad</td>
          <td style="padding:8px;border:1px solid #ddd;background:#0F2D4A;color:#fff;font-weight:bold;text-align:right;">Precio Unit.</td>
          <td style="padding:8px;border:1px solid #ddd;background:#0F2D4A;color:#fff;font-weight:bold;text-align:right;">Subtotal</td>
        </tr>
      </thead>
      <tbody>${materialRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;background:#F8FAFC;color:#0F2D4A;">Total Materiales:</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:#198754;background:#F8FAFC;">$${total}</td>
        </tr>
      </tfoot>
    </table>

    <!-- TOTAL A PAGAR -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;page-break-inside:avoid;">
      <tr>
        <td style="padding:12px;border:2px solid #0F2D4A;background:#0F2D4A;color:#fff;font-weight:bold;font-size:14px;">TOTAL A PAGAR:</td>
        <td style="padding:12px;border:2px solid #0F2D4A;background:#0F2D4A;color:#fff;text-align:right;font-weight:bold;font-size:14px;">$${total}</td>
      </tr>
    </table>

    <!-- FOTOS -->
    <h3 style="page-break-after:avoid;color:#0F2D4A;font-size:16px;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:5px;">Evidencias Fotográficas</h3>
    <div style="width:100%;margin-bottom:30px;display:block;">${photosHtml}</div>

    <!-- FIRMA (sin salto de página forzado, igual que el original) -->
    <table style="width:100%;margin-top:40px;border-collapse:collapse;page-break-inside:avoid;" cellspacing="0" cellpadding="0">
      <tr>
        <td style="width:100%;text-align:center;vertical-align:bottom;padding:10px;">
          <div style="min-height:75px;display:block;margin-bottom:10px;text-align:center;">
            <img src="${data.signatureDataUrl}" alt="Firma" style="max-height:75px;max-width:100%;object-fit:contain;" />
          </div>
          <div style="border-top:1.5px solid #0F2D4A;padding-top:6px;width:300px;margin:0 auto;">
            <p style="margin:0;font-weight:bold;font-size:12px;color:#0F2D4A;text-transform:uppercase;letter-spacing:0.5px;">Subcontratista</p>
          </div>
        </td>
      </tr>
    </table>
  `;

    return el;
}