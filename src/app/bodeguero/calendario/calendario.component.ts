import { jobLocation, escapeLocationHtml } from '../../core/utils/job-location';
import {
    Component,
    DestroyRef,
    OnInit,
    OnDestroy,
    inject,
    signal,
    ElementRef,
    viewChild,
    AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';

import { Calendar, EventContentArg, EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';

import { JobsService } from '../../core/services/jobs.service';
import { UsersService } from '../../core/services/users.service';
import { Job } from '../../core/models/job.model';
import { User } from '../../core/models/user.model';

@Component({
    selector: 'app-bodeguero-calendario',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './calendario.component.html',
    styleUrl: './calendario.component.css'
})
export class CalendarioBodegueroComponent implements OnInit, AfterViewInit, OnDestroy {
    private readonly jobsService = inject(JobsService);
    private readonly usersService = inject(UsersService);
    private readonly destroyRef = inject(DestroyRef);
    readonly error = signal('');

    private readonly calendarEl =
        viewChild.required<ElementRef<HTMLDivElement>>('calendar');
    private calendar: Calendar | null = null;

    readonly loading = signal(true);
    readonly employees = signal<{ id: number; name: string }[]>([]);
    filterEmployeeId = '';

    private allJobs: Job[] = [];
    private viewReady = false;
    private dataReady = false;

    /** Mapa userId → color (igual que en Trabajos) */
    private colorByEmployeeId: Record<number, string> = {};

    ngOnInit(): void {
        this.loadData();
    }

    ngAfterViewInit(): void {
        this.viewReady = true;
        this.tryRender();
    }

    ngOnDestroy(): void {
        this.calendar?.destroy();
        Swal.close();
    }

    loadData(): void {
        this.error.set('');
        this.loading.set(true);

        void Swal.fire({
            title: 'Armando cronograma...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        forkJoin({
            jobs: this.jobsService.getAll(),
            users: this.usersService.getAll()
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: ({ jobs, users }) => {
                this.allJobs = jobs;

                // Construir mapa de colores (igual que en Trabajos)
                const colors: Record<number, string> = {};
                users.forEach((u: User) => {
                    colors[u.userId] = u.color || '#CCCCCC';
                });
                this.colorByEmployeeId = colors;

                const empleados = users
                    .filter((u: User) => {
                        if (Array.isArray(u.roles)) {
                            return u.roles.some(
                                (r) =>
                                    r?.name === 'ROLE_EMPLOYEE' ||
                                    (r as unknown) === 'ROLE_EMPLOYEE'
                            );
                        }
                        return false;
                    })
                    .map((u) => ({
                        id: u.userId,
                        name:
                            u.name ||
                            `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ||
                            'Sin nombre'
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

                this.employees.set(empleados);
                this.loading.set(false);
                this.dataReady = true;
                Swal.close();
                this.tryRender();
            },
            error: () => {
                this.loading.set(false);
                this.error.set('No se pudieron cargar los datos del calendario.');
                Swal.close();
                void Swal.fire(
                    'Error',
                    'No se pudieron cargar los datos del calendario.',
                    'error'
                );
            }
        });
    }

    private tryRender(): void {
        if (this.viewReady && this.dataReady) {
            this.renderCalendar(this.allJobs);
        }
    }

    onFilterChange(): void {
        let list = this.allJobs;
        if (this.filterEmployeeId) {
            list = list.filter(
                (job) => String(job.employeeId) === this.filterEmployeeId
            );
        }
        this.renderCalendar(list);
    }

    resetFilter(): void {
        this.filterEmployeeId = '';
        this.renderCalendar(this.allJobs);
    }

    private toDateStr(jobDate: string | number[] | null | undefined): string {
        if (!jobDate) {
            return new Date().toISOString().split('T')[0];
        }
        if (typeof jobDate === 'string') {
            return jobDate.split('T')[0];
        }
        if (Array.isArray(jobDate)) {
            const [y, m, d] = jobDate;
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        return new Date().toISOString().split('T')[0];
    }

    private cleanDescription(desc?: string | null): string {
        if (!desc) return 'Sin descripción';
        if (desc.includes('[MATERIALES PRE-ASIGNADOS]:')) {
            return (
                desc.split('[MATERIALES PRE-ASIGNADOS]:')[0].trim() ||
                'Sin descripción'
            );
        }
        return desc;
    }

    /** Color del subcontratista (fallback gris) */
    private employeeColor(employeeId?: number | null): string {
        if (!employeeId) return '#CCCCCC';
        const color = this.colorByEmployeeId[employeeId] || '';
        return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#CCCCCC';
    }

    /** Icono + clase según estado (con animación) */
    private statusIcon(status: string): string {
        switch (status) {
            case 'IN_PROGRESS':
                return 'fa-gear fa-spin';
            case 'COMPLETED':
                return 'fa-check-double';
            case 'CANCELLED':
                return 'fa-ban';
            default:
                return 'fa-clock';
        }
    }

    private crearEventos(trabajos: Job[]) {
        return trabajos.map((job) => {
            const bgColor = this.employeeColor(job.employeeId);

            return {
                id: String(job.jobId),
                title: job.clientName,
                start: this.toDateStr(job.jobDate),
                backgroundColor: bgColor,
                borderColor: bgColor,
                extendedProps: {
                    address: jobLocation(job),
                    description: this.cleanDescription(job.description),
                    status: job.status,
                    pay: job.pay,
                    employee: job.nameEmployee || 'Sin asignar',
                    clientPhone: job.clientPhone || '',
                    employeeId: job.employeeId,
                    icon: this.statusIcon(job.status)
                }
            };
        });
    }

    /** Contenido visual del evento con iconos animados */
    private escapeHtml(value: unknown): string {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]!));
    }

    private eventContent = (arg: EventContentArg) => {
        const p = arg.event.extendedProps as {
            status: string;
            pay: number;
            employee: string;
            address: string;
            description: string;
            icon: string;
        };

        const icon = p.icon || 'fa-clock';
        const viewType = arg.view.type;
        const isList =
            viewType === 'listWeek' ||
            viewType === 'listMonth' ||
            viewType === 'listDay';

        // Vista LISTA: detalle completo
        if (isList) {
            return {
                html: `
        <div class="fc-list-event-custom">
          <div class="fc-list-top">
            <span class="fc-list-title">
              <i class="fa-solid ${icon}" style="color:${arg.event.backgroundColor}"></i>
              ${this.escapeHtml(arg.event.title)}
            </span>
            <span class="fc-list-pay">$${Number(p.pay || 0).toFixed(2)}</span>
          </div>
          <div class="fc-list-meta">
            <span><i class="fa-solid fa-user-tie"></i> ${this.escapeHtml(p.employee)}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${escapeLocationHtml(p.address)}</span>
          </div>
          <div class="fc-list-desc" style="border-left-color:${arg.event.backgroundColor}">
            "${this.escapeHtml(p.description)}"
          </div>
        </div>
      `
            };
        }

        // Vista MES / SEMANA: compacto con icono animado
        return {
            html: `
      <div class="fc-day-event-custom" title="${this.escapeHtml(arg.event.title)} · ${this.escapeHtml(p.employee)}">
        <i class="fa-solid ${icon}"></i>
        <span>${this.escapeHtml(arg.event.title)}</span>
      </div>
    `
        };
    };

    private onEventClick = (info: EventClickArg): void => {
        const p = info.event.extendedProps as {
            status: string;
            pay: number;
            employee: string;
            address: string;
            description: string;
            clientPhone: string;
        };

        let estadoTxt = 'Pendiente';
        let badgeColor = '#ff9800';
        if (p.status === 'IN_PROGRESS') {
            estadoTxt = 'En Progreso';
            badgeColor = '#12CFF4';
        } else if (p.status === 'COMPLETED') {
            estadoTxt = 'Completado';
            badgeColor = '#6c757d';
        } else if (p.status === 'CANCELLED') {
            estadoTxt = 'Cancelado';
            badgeColor = '#d32f2f';
        }

        void Swal.fire({
            title: `<h3 style="color:#0f4c81;margin:0;font-weight:700;">${this.escapeHtml(info.event.title)}</h3>`,
            html: `
        <div style="text-align:left;margin-top:15px;font-family:'Poppins',sans-serif;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;padding-bottom:12px;border-bottom:1px dashed #ccc;">
            <span style="background:${badgeColor};color:white;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:bold;">
              ${estadoTxt}
            </span>
          </div>
          <div style="padding-left:5px;">
            <p style="margin:8px 0;font-size:14px;color:#444;">
              <strong><i class="fa-solid fa-phone" style="color:#198754;width:20px;"></i> Teléfono:</strong> ${this.escapeHtml(p.clientPhone || '-')}
            </p>
            <p style="margin:8px 0;font-size:14px;color:#444;">
              <strong><i class="fa-solid fa-location-dot" style="color:#198754;width:20px;"></i> Dirección:</strong> ${escapeLocationHtml(p.address || '-')}
            </p>
            <p style="margin:8px 0;font-size:14px;color:#444;">
              <strong><i class="fa-solid fa-user-tie" style="color:#198754;width:20px;"></i> Empleado:</strong> ${this.escapeHtml(p.employee)}
            </p>
          </div>
          <div style="margin-top:20px;padding:15px;background:#F9FAFC;border-radius:8px;border:1px solid #E0E5F2;">
            <strong style="color:#2B3674;font-size:13px;">
              <i class="fa-solid fa-align-left"></i> Descripción de la obra:
            </strong>
            <p style="margin:8px 0 0;font-size:13px;color:#555;font-style:italic;line-height:1.5;">
              "${this.escapeHtml(p.description)}"
            </p>
          </div>
        </div>
      `,
            showCancelButton: false,
            showDenyButton: false,
            confirmButtonColor: '#0f4c81',
            confirmButtonText: 'Cerrar',
            width: '500px'
        });
    };

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
            events,
            eventContent: this.eventContent,
            eventClick: this.onEventClick
        });

        this.calendar.render();
    }
}