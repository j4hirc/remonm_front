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
    private colorByEmployeeId: Record<number, string> = {};
    private hierarchyByEmployeeId: Record<number, number> = {};

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
        jobs: this.jobsService.getAll(true),
        users: this.usersService.getAll(true)
    })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
            next: ({ jobs, users }) => {
                this.allJobs = jobs;

                const colors: Record<number, string> = {};
                users.forEach((u: User) => {
                    colors[u.userId] = u.color || '#CCCCCC';
                });
                this.colorByEmployeeId = colors;

                const hierarchies: Record<number, number> = {};

                users.forEach((u: User) => {
                    const level = u.hierarchyLevel;

                    if (
                        typeof level === 'number' &&
                        Number.isInteger(level) &&
                        level >= 1
                    ) {
                        hierarchies[u.userId] = level;
                    }
                });

                this.hierarchyByEmployeeId = hierarchies;

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
        if (!jobDate) return new Date().toISOString().split('T')[0];
        if (typeof jobDate === 'string') return jobDate.split('T')[0];
        if (Array.isArray(jobDate)) {
            const [y, m, d] = jobDate;
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        return new Date().toISOString().split('T')[0];
    }

    private formatDateDisplay(fecha: string | number[] | null | undefined): string {
        if (!fecha) return 'Sin fecha';
        if (Array.isArray(fecha)) {
            const [y, m, d] = fecha;
            return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
        }
        const parts = String(fecha).split(/[-T]/);
        if (parts.length >= 3) return `${parts[1]}/${parts[2].slice(0, 2)}/${parts[0]}`;
        return String(fecha);
    }

    private cleanDescription(desc?: string | null): string {
        if (!desc) return 'Sin descripción';
        if (desc.includes('[MATERIALES PRE-ASIGNADOS]:')) {
            return desc.split('[MATERIALES PRE-ASIGNADOS]:')[0].trim() || 'Sin descripción';
        }
        return desc;
    }

    private employeeHierarchy(employeeId?: number | null): number {
        if (employeeId == null) {
            return Number.MAX_SAFE_INTEGER;
        }

        return this.hierarchyByEmployeeId[employeeId]
            ?? Number.MAX_SAFE_INTEGER;
    }

    private employeeColor(employeeId?: number | null): string {
        if (!employeeId) return '#CCCCCC';
        const color = this.colorByEmployeeId[employeeId] || '';
        return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#CCCCCC';
    }

    private textColorForBackground(hex: string): string {
        if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return '#ffffff';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.55 ? '#1a1a1a' : '#ffffff';
    }

    private colorPriority(hex: string): number {
        if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return 3;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
            else if (max === g) h = ((b - r) / d + 2) * 60;
            else h = ((r - g) / d + 4) * 60;
        }
        if (h < 30 || h >= 330) return 0;
        if (h < 75) return 1;
        if (h < 165) return 2;
        return 3;
    }

    private statusIcon(status: string): string {
        switch (status) {
            case 'IN_PROGRESS': return 'fa-gear fa-spin';
            case 'REVIEW': return 'fa-clipboard-check';
            case 'COMPLETED': return 'fa-check-double';
            case 'CANCELLED': return 'fa-ban';
            default: return 'fa-clock';
        }
    }

    private statusLabel(status: string): string {
        switch (status) {
            case 'IN_PROGRESS': return 'En Progreso';
            case 'COMPLETED': return 'Completado';
            case 'CANCELLED': return 'Cancelado';
            default: return 'Pendiente';
        }
    }

    private fullLocation(job: Job): string {
        const base = jobLocation(job) || job.address || '';
        const extra: string[] = [];
        if (job.buildingNumber && !base.toLowerCase().includes(String(job.buildingNumber).toLowerCase())) {
            extra.push(`Edificio: ${job.buildingNumber}`);
        }
        if (job.apartment && !base.toLowerCase().includes(String(job.apartment).toLowerCase())) {
            extra.push(`Depto: ${job.apartment}`);
        }
        return extra.length ? `${base} · ${extra.join(' · ')}` : base;
    }

    private crearEventos(trabajos: Job[]) {
        return trabajos.map((job) => {
            const bgColor = this.employeeColor(job.employeeId);
            const textColor = this.textColorForBackground(bgColor);
            const location = this.fullLocation(job);
            const dateStr = this.formatDateDisplay(job.jobDate);
            const desc = this.cleanDescription(job.description);

            const tooltip = [
                job.clientName || '',
                location ? `📍 ${location}` : '',
                job.clientPhone ? `📞 ${job.clientPhone}` : '',
                `👷 ${job.nameEmployee || 'Sin asignar'}`,
                job.nameManager ? `👔 Manager: ${job.nameManager}` : '',
                `📅 ${dateStr}`,
                `💰 $${Number(job.pay || 0).toFixed(2)}`,
                `📌 ${this.statusLabel(job.status)}`,
                job.priority != null ? `⚡ Prioridad: ${job.priority}` : '',
                job.quickbooksInvoice ? `QB: ${job.quickbooksInvoice}` : '',
                desc
            ].filter(Boolean).join('\n');

            return {
                id: String(job.jobId),
                title: job.clientName,
                start: this.toDateStr(job.jobDate),
                backgroundColor: bgColor,
                borderColor: bgColor,
                textColor,
                order: this.employeeHierarchy(job.employeeId),
                extendedProps: {
                    address: job.address || '',
                    buildingNumber: job.buildingNumber || '',
                    apartment: job.apartment || '',
                    location,
                    description: desc,
                    status: job.status,
                    pay: job.pay,
                    employee: job.nameEmployee || 'Sin asignar',
                    manager: job.nameManager || 'Sin asignar',
                    clientPhone: job.clientPhone || '',
                    employeeId: job.employeeId,
                    icon: this.statusIcon(job.status),
                    textColor,
                    jobDate: dateStr,
                    priority: job.priority ?? 2,
                    quickbooksInvoice: job.quickbooksInvoice || '',
                    safeDepositBoxCodes: job.safeDepositBoxCodes || '',
                    tooltip
                }
            };
        });
    }

    private escapeHtml(value: unknown): string {
        return String(value ?? '').replace(/[&<>"']/g, (char) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char]!
        );
    }

    private eventContent = (arg: EventContentArg) => {
        const p = arg.event.extendedProps as {
            pay: number;
            employee: string;
            address: string;
            location: string;
            description: string;
            icon: string;
            tooltip: string;
        };
        const icon = p.icon || 'fa-clock';
        const isList = ['listWeek', 'listMonth', 'listDay'].includes(arg.view.type);
        const loc = p.location || p.address || '';

        if (isList) {
            return {
                html: `
        <div class="fc-list-event-custom" title="${this.escapeHtml(p.tooltip || '')}">
          <div class="fc-list-top">
            <span class="fc-list-title">
              <i class="fa-solid ${icon}" style="color:${arg.event.backgroundColor}"></i>
              ${this.escapeHtml(arg.event.title)}
            </span>
            <span class="fc-list-pay">$${Number(p.pay || 0).toFixed(2)}</span>
          </div>
          <div class="fc-list-meta">
            <span><i class="fa-solid fa-user-tie"></i> ${this.escapeHtml(p.employee)}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${escapeLocationHtml(loc)}</span>
          </div>
          <div class="fc-list-desc" style="border-left-color:${arg.event.backgroundColor}">
            "${this.escapeHtml(p.description)}"
          </div>
        </div>`
            };
        }

        return {
            html: `
      <div class="fc-day-event-custom"
           style="color:${arg.event.textColor || '#fff'}"
           title="${this.escapeHtml(p.tooltip || arg.event.title)}">
        <i class="fa-solid ${icon}"></i>
        <span>${this.escapeHtml(arg.event.title)}</span>
      </div>`
        };
    };

    private onEventClick = (info: EventClickArg): void => {
        const p = info.event.extendedProps as {
            status: string;
            pay: number;
            employee: string;
            manager: string;
            address: string;
            buildingNumber: string;
            apartment: string;
            location: string;
            description: string;
            clientPhone: string;
            jobDate: string;
            priority: number;
            quickbooksInvoice: string;
            safeDepositBoxCodes: string;
        };

        const estadoTxt = this.statusLabel(p.status);
        let badgeColor = '#ff9800';
        if (p.status === 'IN_PROGRESS') badgeColor = '#12CFF4';
        else if (p.status === 'REVIEW') badgeColor = '#9333ea';
        else if (p.status === 'COMPLETED') badgeColor = '#6c757d';
        else if (p.status === 'CANCELLED') badgeColor = '#d32f2f';

        const edificio = p.buildingNumber
            ? `<p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-building" style="color:#198754;width:20px;"></i> Edificio:</strong> ${this.escapeHtml(p.buildingNumber)}</p>`
            : '';
        const depto = p.apartment
            ? `<p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-door-open" style="color:#198754;width:20px;"></i> Departamento:</strong> ${this.escapeHtml(p.apartment)}</p>`
            : '';
        const qb = p.quickbooksInvoice
            ? `<p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-file-invoice-dollar" style="color:#198754;width:20px;"></i> QuickBooks:</strong> ${this.escapeHtml(p.quickbooksInvoice)}</p>`
            : '';
        const caja = p.safeDepositBoxCodes
            ? `<p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-key" style="color:#198754;width:20px;"></i> Caja seguridad:</strong> ${this.escapeHtml(p.safeDepositBoxCodes)}</p>`
            : '';

        void Swal.fire({
            title: `<h3 style="color:#0f4c81;margin:0;font-weight:700;">${this.escapeHtml(info.event.title)}</h3>`,
            html: `
        <div style="text-align:left;margin-top:12px;font-family:'Poppins',sans-serif;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px dashed #ccc;gap:8px;flex-wrap:wrap;">
            <span style="background:${badgeColor};color:white;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:bold;">${estadoTxt}</span>
            <span style="font-weight:bold;color:#2e7d32;font-size:1.15rem;">$${Number(p.pay || 0).toFixed(2)}</span>
          </div>
          <div style="padding-left:4px;">
            <p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-phone" style="color:#198754;width:20px;"></i> Teléfono:</strong> ${this.escapeHtml(p.clientPhone || '-')}</p>
            <p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-location-dot" style="color:#198754;width:20px;"></i> Dirección:</strong> ${escapeLocationHtml(p.address || p.location || '-')}</p>
            ${edificio}${depto}
            <p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-regular fa-calendar" style="color:#198754;width:20px;"></i> Fecha:</strong> ${this.escapeHtml(p.jobDate || '-')}</p>
            <p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-user-tie" style="color:#198754;width:20px;"></i> Subcontratista:</strong> ${this.escapeHtml(p.employee)}</p>
            <p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-user-shield" style="color:#198754;width:20px;"></i> Manager:</strong> ${this.escapeHtml(p.manager)}</p>
            <p style="margin:6px 0;font-size:14px;color:#444;"><strong><i class="fa-solid fa-flag" style="color:#198754;width:20px;"></i> Prioridad:</strong> ${p.priority}</p>
            ${qb}${caja}
          </div>
          <div style="margin-top:16px;padding:14px;background:#F9FAFC;border-radius:8px;border:1px solid #E0E5F2;">
            <strong style="color:#2B3674;font-size:13px;"><i class="fa-solid fa-align-left"></i> Descripción</strong>
            <p style="margin:8px 0 0;font-size:13px;color:#555;font-style:italic;line-height:1.5;">"${this.escapeHtml(p.description)}"</p>
          </div>
        </div>`,
            showCancelButton: false,
            showDenyButton: false,
            confirmButtonColor: '#0f4c81',
            confirmButtonText: 'Cerrar',
            width: '480px'
        });
    };

    private renderCalendar(jobs: Job[]): void {
    const events = this.crearEventos(jobs);

    if (this.calendar) {
        this.calendar.batchRendering(() => {
            this.calendar!.removeAllEventSources();
            this.calendar!.addEventSource(events);
        });
        return;
    }

    this.calendar = new Calendar(this.calendarEl().nativeElement, {
        plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
        initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
        locale: esLocale,
        firstDay: 0,
        height: 'auto',
        eventOrder: 'order,title,id',
        eventOrderStrict: true,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Agenda' },
        events,
        eventContent: this.eventContent,
        eventClick: this.onEventClick,
        eventDidMount: (info) => {
            const tip = (info.event.extendedProps as { tooltip?: string }).tooltip;
            if (tip) info.el.setAttribute('title', tip);
        }
    });

    this.calendar.render();
}
}