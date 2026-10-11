import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

import { JobsService } from './jobs.service';
import { AssignmentsService } from './assignments.service';
import { Job } from '../models/job.model';

@Injectable({ providedIn: 'root' })
export class AssignmentPreviewService {
  private readonly jobs = inject(JobsService);
  private readonly assignments = inject(AssignmentsService);
  private opened = false;

  async open(jobId: number): Promise<boolean> {
    if (this.opened) return false;

    this.opened = true;

    try {
      void Swal.fire({
        title: 'Cargando trabajo...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
      });

      const pending = await firstValueFrom(this.assignments.mine());
      const assignment = pending.find(item => item.jobId === jobId);

      if (!assignment) {
        await Swal.fire(
          'Asignación no disponible',
          'El trabajo ya no está pendiente de tu respuesta. Actualiza el calendario.',
          'info'
        );
        return false;
      }

      const job = await firstValueFrom(this.jobs.getById(jobId));

      if (
        job.assignmentId !== assignment.id ||
        job.employeeId !== assignment.employeeId ||
        job.assignmentStatus !== 'PENDING'
      ) {
        await Swal.fire(
          'La asignación cambió',
          'Actualiza el calendario para consultar el estado actual.',
          'info'
        );
        return false;
      }

      const expiresAt = assignment.expiresAt
        ? Date.parse(assignment.expiresAt)
        : NaN;

      if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
        await Swal.fire(
          'Plazo vencido',
          'Esta asignación ya no permite responder.',
          'info'
        );
        return false;
      }

      const result = await Swal.fire({
        titleText: 'Detalle del trabajo',
        html: this.details(job, expiresAt),
        width: 680,
        heightAuto: false,
        showConfirmButton: true,
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Aceptar trabajo',
        denyButtonText: 'Rechazar',
        cancelButtonText: 'Cerrar',
        confirmButtonColor: '#00897b',
        denyButtonColor: '#c62828',
        cancelButtonColor: '#64748b'
      });

      if (!result.isConfirmed && !result.isDenied) return false;

      const decision = result.isConfirmed ? 'ACCEPT' : 'REJECT';

      if (decision === 'REJECT') {
        const confirmation = await Swal.fire({
          icon: 'warning',
          titleText: '¿Rechazar este trabajo?',
          text: 'Se ofrecerá al siguiente subcontratista disponible.',
          showCancelButton: true,
          confirmButtonText: 'Sí, rechazar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#c62828'
        });

        if (!confirmation.isConfirmed) return false;
      }

      if (Date.now() >= expiresAt) {
        await Swal.fire(
          'Plazo vencido',
          'El plazo terminó mientras revisabas el trabajo.',
          'info'
        );
        return false;
      }

      void Swal.fire({
        title: 'Guardando respuesta...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
      });

      // El backend vuelve a validar propietario, estado y vencimiento.
      const response = await firstValueFrom(
        this.assignments.respond(assignment.id, decision)
      );

      await Swal.fire({
        icon: 'info',
        titleText: 'Resultado de la solicitud',
        text: response.message
      });

      return true;
    } catch {
      await Swal.fire(
        'No se pudo completar',
        'Actualiza las asignaciones y comprueba si el trabajo sigue pendiente antes de volver a responder.',
        'error'
      );
      return false;
    } finally {
      this.opened = false;
    }
  }

  private escape(value: unknown): string {
    return String(value ?? '').replace(
      /[&<>"']/g,
      character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character]!)
    );
  }

  private safeUrl(value: string): string | null {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }

  private formatDate(value: Job['jobDate']): string {
    if (!value) return 'Sin fecha';

    if (Array.isArray(value)) {
      const [year, month, day] = value;
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }

    const [year, month, day] = value.split('T')[0].split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  private details(job: Job, expiresAt: number): string {
    const e = (value: unknown) => this.escape(value);

    const field = (label: string, value: unknown) => `
      <div style="padding:5px 0;border-bottom:1px solid #eef2f6">
        <strong>${e(label)}:</strong>
        ${e(value === null || value === undefined || value === ''
          ? 'No registrado'
          : value)}
      </div>
    `;

    const materials = (job.materials ?? []).map(material => `
      <tr>
        <td style="padding:7px;border-bottom:1px solid #eee">
          ${e(material.name)}
        </td>
        <td style="padding:7px;border-bottom:1px solid #eee;text-align:right">
          ${e(material.quantity ?? 0)}
        </td>
        <td style="padding:7px;border-bottom:1px solid #eee">
          ${e(material.unit || '—')}
        </td>
      </tr>
    `).join('');

    const plans = (job.blueprintUrls ?? []).map((value, index) => {
      const url = this.safeUrl(value);
      return url ? `
        <a href="${e(url)}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;margin:4px 10px 4px 0">
          Ver plano ${index + 1}
        </a>
      ` : '';
    }).join('');

    const map = Number.isFinite(job.latitude) &&
                Number.isFinite(job.longitude)
      ? `
        <a
          href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${job.latitude},${job.longitude}`)}"
          target="_blank" rel="noopener noreferrer">
          Ver ubicación en Google Maps
        </a>
      `
      : '';

    const description = (job.description ?? '')
      .split('[MATERIALES PRE-ASIGNADOS]:')[0].trim();

    return `
      <div style="text-align:left;font-size:13px;line-height:1.45;overflow-wrap:anywhere">
        <div style="padding:10px;background:#fff7e6;border-radius:8px;margin-bottom:10px">
          <strong>Pendiente de tu respuesta</strong><br>
          Responder antes de:
          ${e(new Date(expiresAt).toLocaleString('es-EC'))}
          (hora de tu dispositivo).
        </div>

        ${field('Trabajo', `#${job.jobId}`)}
        ${field('Cliente / Propiedad', job.clientName)}
        ${field('Fecha', this.formatDate(job.jobDate))}
        ${field('Dirección', job.address)}
        ${field('Edificio', job.buildingNumber)}
        ${field('Departamento', job.apartment)}
        ${field('Teléfono', job.clientPhone)}
        ${field('Subcontratista', job.nameEmployee)}
        ${field('Manager', job.nameManager)}
        ${field('Caja de seguridad', job.safeDepositBoxCodes)}
        ${field('QuickBooks', job.quickbooksInvoice)}
        ${field('Prioridad',
          job.priority === 1 ? 'Alta' :
          job.priority === 2 ? 'Media' : 'Baja')}
        ${field('Pago asignado', new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(job.pay ?? 0))}

        <h4 style="margin:12px 0 5px">Instrucciones</h4>
        <p style="margin:0;white-space:pre-wrap">${e(description || 'Sin instrucciones adicionales.')}</p>

        <h4 style="margin:12px 0 5px">Materiales asignados</h4>
        ${materials ? `
          <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px">
            <thead>
              <tr>
                <th style="width:65%;text-align:left;padding:7px">Material</th>
                <th style="width:17%;text-align:right;padding:7px">Cantidad</th>
                <th style="width:18%;text-align:left;padding:7px">Unidad</th>
              </tr>
            </thead>
            <tbody>${materials}</tbody>
          </table>
        ` : '<p>No hay materiales registrados.</p>'}

        ${plans ? `<h4 style="margin:12px 0 5px">Planos</h4>${plans}` : ''}
        ${map ? `<p style="margin:12px 0 0">${map}</p>` : ''}
      </div>
    `;
  }
}