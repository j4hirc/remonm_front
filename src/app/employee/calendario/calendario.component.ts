import {
    AfterViewInit,
    Component,
    ElementRef,
    inject,
    OnDestroy,
    OnInit,
    signal,
    viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';

import { Calendar, EventClickArg, EventContentArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';

import { JobsService } from '../../core/services/jobs.service';
import { UsersService } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import { Job } from '../../core/models/job.model';
import { User } from '../../core/models/user.model';

declare const L: any;

@Component({
    selector: 'app-employee-calendario',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './calendario.component.html',
    styleUrl: './calendario.component.css'
})
export class CalendarioEmployeeComponent
    implements OnInit, AfterViewInit, OnDestroy {
    private readonly jobsService = inject(JobsService);
    private readonly usersService = inject(UsersService);
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);

    private readonly calendarEl =
        viewChild.required<ElementRef<HTMLDivElement>>('calendar');

    private calendar: Calendar | null = null;
    private map: any = null;
    private myEmployeeId: number | null = null;
    private myJobs: Job[] = [];
    private currentJob: Job | null = null;
    private viewReady = false;
    private dataReady = false;

    readonly loading = signal(true);

    ngOnInit(): void {
        this.loadData();
    }

    ngAfterViewInit(): void {
        this.viewReady = true;
        this.tryRender();
    }

    ngOnDestroy(): void {
        this.destroyMap();
        this.calendar?.destroy();
    }

    private loadData(): void {
        this.loading.set(true);

        void Swal.fire({
            title: 'Cargando tus trabajos...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        forkJoin({
            jobs: this.jobsService.getAll(),
            users: this.usersService.getAll()
        }).subscribe({
            next: ({ jobs, users }) => {
                const email = (this.authService.email() || '').toLowerCase().trim();
                const yo = users.find(
                    (u: User) => (u.email || '').toLowerCase().trim() === email
                );

                this.myEmployeeId = yo?.userId ?? null;
                this.myJobs = this.myEmployeeId
                    ? jobs.filter((j) => j.employeeId === this.myEmployeeId)
                    : [];

                this.loading.set(false);
                this.dataReady = true;
                Swal.close();
                this.tryRender();
            },
            error: () => {
                this.loading.set(false);
                Swal.close();
                void Swal.fire(
                    'Error',
                    'No se pudieron cargar tus trabajos.',
                    'error'
                );
            }
        });
    }

    private tryRender(): void {
        if (this.viewReady && this.dataReady) {
            this.renderCalendar(this.myJobs);
        }
    }

    private toDateStr(jobDate: string | number[] | null | undefined): string {
        if (!jobDate) return new Date().toISOString().split('T')[0];
        if (typeof jobDate === 'string') return jobDate.split('T')[0];
        if (Array.isArray(jobDate)) {
            const [y, m, d] = jobDate;
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        return new Date().toISOString().split('T')[0];
    }

    private formatDate(fecha: string | number[] | null | undefined): string {
        if (!fecha) return 'Sin fecha asignada';
        if (Array.isArray(fecha)) {
            const [y, m, d] = fecha;
            return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${y}`;
        }
        const parts = String(fecha).split('-');
        if (parts.length === 3) return `${parts[1]}-${parts[2]}-${parts[0]}`;
        return String(fecha);
    }

    private cleanDescription(desc?: string | null): string {
        if (!desc) return '';
        if (desc.includes('[MATERIALES PRE-ASIGNADOS]:')) {
            return desc.split('[MATERIALES PRE-ASIGNADOS]:')[0].trim();
        }
        return desc;
    }

    private styleForJob(job: Job): { bg: string; border: string; icon: string } {
        const prioridad = job.priority || 3;
        let bg = '#64748B';
        let border = '#475569';
        let icon = 'fa-clock';

        if (prioridad === 1) {
            bg = '#EF4444';
            border = '#B91C1C';
            icon = 'fa-fire-flame-curved';
        } else if (prioridad === 2) {
            bg = '#F59E0B';
            border = '#D97706';
            icon = 'fa-exclamation-triangle';
        } else if (prioridad === 3) {
            bg = '#10B981';
            border = '#059669';
            icon = 'fa-clock';
        }

        if (job.status === 'IN_PROGRESS') {
            bg = '#12CFF4';
            border = '#0EA5C4';
            icon = 'fa-spinner fa-spin';
        }
        if (job.status === 'COMPLETED') {
            bg = '#9CA3AF';
            border = '#6B7280';
            icon = 'fa-circle-check';
        }
        if (job.status === 'CANCELLED') {
            bg = '#6B7280';
            border = '#4B5563';
            icon = 'fa-circle-xmark';
        }

        return { bg, border, icon };
    }

    private crearEventos(jobs: Job[]) {
        return jobs.map((job) => {
            const s = this.styleForJob(job);
            const prioridad = job.priority || 3;
            return {
                id: String(job.jobId),
                title: job.clientName,
                start: this.toDateStr(job.jobDate),
                backgroundColor: s.bg,
                borderColor: s.border,
                extendedProps: {
                    job,
                    prioridad,
                    iconClass: s.icon,
                    fechaHermosa: this.formatDate(job.jobDate)
                }
            };
        });
    }

    private eventContent = (arg: EventContentArg) => {
        const p = arg.event.extendedProps as {
            prioridad: number;
            iconClass: string;
            job: Job;
        };

        const badge =
            p.prioridad === 1
                ? `<span class="prio-badge alta">¡ALTA!</span>`
                : p.prioridad === 2
                    ? `<span class="prio-badge media">MEDIA</span>`
                    : '';

        if (arg.view.type.startsWith('list')) {
            return {
                html: `
          <div class="fc-emp-list">
            <div class="fc-emp-list-top">
              <span class="fc-emp-title">
                <i class="fa-solid ${p.iconClass}" style="color:${arg.event.backgroundColor}"></i>
                ${arg.event.title} ${badge}
              </span>
              <span class="fc-emp-pay">$${Number(p.job.pay || 0).toFixed(2)}</span>
            </div>
            <div class="fc-emp-addr"><strong>Dir:</strong> ${p.job.address || 'Sin dirección'}</div>
          </div>
        `
            };
        }

        return {
            html: `
        <div class="fc-emp-day" title="${arg.event.title}">
          <i class="fa-solid ${p.iconClass}"></i>
          <span>${arg.event.title}</span>
          ${badge}
        </div>
      `
        };
    };

    private onEventClick = (info: EventClickArg): void => {
        const p = info.event.extendedProps as {
            job: Job;
            prioridad: number;
            fechaHermosa: string;
        };
        const job = p.job;
        this.currentJob = job;

        const bloqueado =
            job.status === 'COMPLETED' || job.status === 'CANCELLED';

        let estadoTxt = 'Pendiente';
        let badgeColor = '#F59E0B';
        if (job.status === 'IN_PROGRESS') {
            estadoTxt = 'En Progreso';
            badgeColor = '#00B8A9';
        } else if (job.status === 'COMPLETED') {
            estadoTxt = 'Completado';
            badgeColor = '#10B981';
        } else if (job.status === 'CANCELLED') {
            estadoTxt = 'Cancelado';
            badgeColor = '#EF4444';
        }

        const prioridadHTML =
            p.prioridad === 1
                ? `<span style="background:#EF4444;color:#fff;padding:6px 12px;border-radius:6px;font-weight:bold;">🔥 PRIORIDAD ALTA</span>`
                : p.prioridad === 2
                    ? `<span style="background:#F59E0B;color:#fff;padding:6px 12px;border-radius:6px;font-weight:bold;">⚠️ PRIORIDAD MEDIA</span>`
                    : `<span style="background:#64748B;color:#fff;padding:6px 12px;border-radius:6px;font-weight:bold;">PRIORIDAD BAJA</span>`;

        const desc = this.cleanDescription(job.description);
        const mats = job.materials || [];
        const listaMats =
            mats.length === 0
                ? `<li style="list-style:none;color:#666;font-size:13px;">No hay materiales registrados en la orden.</li>`
                : mats
                    .map((m: any) => {
                        const qty = m.quantity && m.quantity > 0 ? m.quantity : '';
                        const unit = m.unit && m.unit !== 'N/A' ? m.unit : '';
                        const text = qty || unit ? `${qty} ${unit}`.trim() : 'Asignado';
                        return `<li style="list-style:none;margin-bottom:8px;font-size:13px;color:#2B3674;display:flex;gap:8px;align-items:center;">
                <i class="fa-solid fa-circle-check" style="color:#00B8A9;"></i>
                <span>${m.name}: <strong style="color:#12CFF4;">${text}</strong></span>
              </li>`;
                    })
                    .join('');

        const planos = job.blueprintUrls || [];
        const planoHtml =
            planos.length > 0
                ? `<div style="text-align:center;margin:16px 0;">
            <button type="button" id="btnVerPlanosEmp" style="width:100%;padding:12px;border:none;border-radius:12px;background:linear-gradient(135deg,#12CFF4,#0f4c81);color:#fff;font-weight:700;cursor:pointer;">
              <i class="fa-solid fa-folder-open"></i> Ver Planos Adjuntos (${planos.length})
            </button>
          </div>`
                : '';

        const bloqueoHtml = bloqueado
            ? `<div style="margin-top:15px;padding:12px;background:rgba(16,185,129,0.1);border:1px solid #10B981;border-radius:8px;text-align:center;font-weight:700;">
           <i class="fa-solid fa-circle-check" style="color:#10B981;"></i> Proyecto Finalizado.
         </div>`
            : '';

        void Swal.fire({
            title: `<h3 style="color:#111C44;margin:0;font-weight:700;">Detalles de la Orden</h3>`,
            html: `
        <div style="text-align:left;font-family:Poppins,sans-serif;margin-top:10px;">
          <div style="text-align:center;margin-bottom:12px;padding-bottom:12px;border-bottom:1px dashed #E2E8F0;">
            <span style="background:${badgeColor};color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:bold;">Estado: ${estadoTxt}</span>
          </div>
          <div style="text-align:center;margin:12px 0 18px;">${prioridadHTML}</div>
          <p style="margin:8px 0;font-size:14px;color:#2B3674;"><strong><i class="fa-regular fa-calendar" style="color:#00B8A9;width:20px;"></i> Fecha:</strong> ${p.fechaHermosa}</p>
          <p style="margin:8px 0;font-size:14px;color:#2B3674;"><strong><i class="fa-solid fa-house" style="color:#00B8A9;width:20px;"></i> Propiedad:</strong> ${job.clientName}</p>
          <p style="margin:8px 0;font-size:14px;color:#2B3674;"><strong><i class="fa-solid fa-phone" style="color:#00B8A9;width:20px;"></i> Teléfono:</strong> ${job.clientPhone || 'No registrado'}</p>
          <p style="margin:8px 0;font-size:14px;color:#2B3674;"><strong><i class="fa-solid fa-location-dot" style="color:#00B8A9;width:20px;"></i> Dirección:</strong> ${job.address || 'Sin dirección'}</p>
          <p style="margin:8px 0;font-size:14px;color:#2B3674;"><strong><i class="fa-solid fa-lock" style="color:#00B8A9;width:20px;"></i> Código Caja Fuerte:</strong> ${job.safeDepositBoxCodes || 'No registrado'}</p>
          <p style="margin:8px 0;font-size:14px;color:#2B3674;"><strong><i class="fa-solid fa-sack-dollar" style="color:#00B8A9;width:20px;"></i> Pago:</strong> $${Number(job.pay || 0).toFixed(2)}</p>
          ${planoHtml}
          <div style="margin-top:16px;">
            <h4 style="margin:0 0 8px;font-size:14px;color:#111C44;border-bottom:2px solid #F4F7FE;padding-bottom:5px;">
              <i class="fa-regular fa-comments" style="color:#00B8A9;"></i> Instrucciones
            </h4>
            <p style="margin:0 0 12px;font-size:13px;color:#4A5568;white-space:pre-wrap;">${desc || 'Sin notas especiales.'}</p>
            <h4 style="margin:0 0 10px;font-size:14px;color:#111C44;border-bottom:2px solid #F4F7FE;padding-bottom:5px;">
              <i class="fa-solid fa-boxes-packing" style="color:#00B8A9;"></i> Materiales asignados
            </h4>
            <ul style="margin:0;padding:0 0 0 5px;">${listaMats}</ul>
          </div>
          <div style="position:relative;margin-top:15px;">
            <div id="swalMapEmp" style="height:180px;width:100%;border-radius:8px;border:1px solid #ddd;"></div>
            <a href="https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}" target="_blank"
              style="position:absolute;bottom:10px;right:10px;background:#111C44;color:#fff;padding:8px 15px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:12px;z-index:1000;">
              <i class="fa-solid fa-map-location-dot"></i> Ir a la Obra
            </a>
          </div>
          ${bloqueoHtml}
        </div>
      `,
            showCancelButton: true,
            showDenyButton: true,
            showConfirmButton: !bloqueado,
            confirmButtonColor: '#00B8A9',
            denyButtonColor: '#0F2D4A',
            cancelButtonColor: '#1B254B',
            confirmButtonText: '<i class="fa-solid fa-camera"></i> Hacer Reporte',
            denyButtonText: '<i class="fa-solid fa-folder-open"></i> Ver Evidencias',
            cancelButtonText: 'Cerrar',
            width: '450px',
            didOpen: () => {
                this.destroyMap();
                const el = document.getElementById('swalMapEmp');
                if (el && job.latitude != null && job.longitude != null) {
                    this.map = L.map(el).setView([job.latitude, job.longitude], 15);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(
                        this.map
                    );
                    L.marker([job.latitude, job.longitude]).addTo(this.map);
                    setTimeout(() => this.map?.invalidateSize(), 100);
                }
                document
                    .getElementById('btnVerPlanosEmp')
                    ?.addEventListener('click', () => this.verPlanos());
            },
            willClose: () => this.destroyMap()
        }).then((result) => {
            if (result.isConfirmed && !bloqueado) {
                void this.router.navigate(['/employee/reporte'], {
                    queryParams: { jobId: job.jobId }
                });
            } else if (result.isDenied) {
                void this.router.navigate(['/employee/evidencias'], {
                    queryParams: { jobId: job.jobId }
                });
            }
        });
    };

    private verPlanos(): void {
        const urls = this.currentJob?.blueprintUrls || [];
        if (!urls.length) {
            void Swal.fire('Sin planos', 'No hay planos adjuntos.', 'info');
            return;
        }
        const html = urls
            .map(
                (url, i) =>
                    `<a href="${url}" target="_blank" style="display:flex;align-items:center;justify-content:space-between;padding:12px;margin:8px 0;background:#fff;border:2px solid #e2e8f0;border-radius:12px;text-decoration:none;color:#0f4c81;font-weight:600;">
            <span><i class="fa-solid fa-file-pdf" style="color:#0ea5e9;margin-right:8px;"></i> Plano / Documento ${i + 1}</span>
            <i class="fa-solid fa-chevron-right" style="color:#94a3b8;"></i>
          </a>`
            )
            .join('');
        void Swal.fire({
            title: 'Planos del Proyecto',
            html,
            confirmButtonColor: '#00B8A9',
            width: 420
        });
    }

    private destroyMap(): void {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }

    private renderCalendar(jobs: Job[]): void {
        const events = this.crearEventos(jobs);

        if (this.calendar) {
            this.calendar.removeAllEvents();
            this.calendar.addEventSource(events);
            return;
        }

        this.calendar = new Calendar(this.calendarEl().nativeElement, {
            plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
            initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
            locale: esLocale,
            height: 'auto',
            eventOrder: 'prioridad,start,title',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek'
            },
            buttonText: {
                today: 'Hoy',
                month: 'Mes',
                week: 'Semana',
                list: 'Agenda'
            },
            noEventsContent: 'No tienes trabajos asignados por el momento.',
            dayMaxEvents: 3,
            events,
            eventContent: this.eventContent,
            eventClick: this.onEventClick
        });

        this.calendar.render();
        setTimeout(() => this.calendar?.updateSize(), 300);
    }
}