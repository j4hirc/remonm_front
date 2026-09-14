import {
    Component,
    DestroyRef,
    inject,
    OnInit,
    signal, computed, viewChild
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';
import { SwalComponent, SwalPortalDirective, SwalPortalTargets } from '@sweetalert2/ngx-sweetalert2';

import { Job, JobUpdate } from '../../core/models/job.model';
import { User } from '../../core/models/user.model';
import { JobsService } from '../../core/services/jobs.service';
import { UsersService } from '../../core/services/users.service';

@Component({
    selector: 'app-evidencias',
    standalone: true,
    imports: [SwalComponent, SwalPortalDirective],
    templateUrl: './evidencias.component.html',
    styleUrl: './evidencias.component.css'
})
export class EvidenciasComponent implements OnInit {
    private readonly jobsService = inject(JobsService);
    private readonly usersService = inject(UsersService);
    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);

    readonly jobs = signal<readonly Job[]>([]);
    readonly managers = signal<readonly User[]>([]);
    readonly colorByEmployeeId = signal<Record<number, string>>({});

    readonly isLoading = signal(false);
    readonly loadError = signal(false);

    readonly searchText = signal('');
    readonly managerFilter = signal('ALL');
    readonly statusFilter = signal('ALL');
    readonly priorityFilter = signal('');

    readonly selectedJob = signal<Job | null>(null);
    readonly swalTargets = inject(SwalPortalTargets);
    private readonly historyModal = viewChild.required<SwalComponent>('historyModal');
    readonly photoUrl = signal<string | null>(null);
    readonly photoLoading = signal(false);
    readonly photoError = signal(false);
    readonly failedImages = signal<ReadonlySet<string>>(new Set());
    readonly loadedImages = signal<ReadonlySet<string>>(new Set());
    readonly selectedUpdates = computed(() => {
        const job = this.selectedJob();
        return job ? this.orderedUpdates(job) : [];
    });

    ngOnInit(): void {
        void this.bootstrap();
    }

    private async bootstrap(): Promise<void> {
        this.isLoading.set(true);
        try {
            await this.loadUsers();
            await this.loadJobs();

            const jobIdParam = this.route.snapshot.queryParamMap.get('jobId');
            if (jobIdParam) {
                const id = parseInt(jobIdParam, 10);
                const job = this.jobs().find((j) => j.jobId === id);
                if (job) {
                    if (job.updateJob && job.updateJob.length > 0) {
                        if (!this.destroyRef.destroyed) this.openModal(job);
                    } else {
                        await Swal.fire({
                            icon: 'info',
                            title: 'Sin evidencias',
                            text: `El proyecto de "${job.clientName}" no registra avances fotográficos todavía.`,
                            confirmButtonColor: '#12CFF4'
                        });
                    }
                }
            }
        } finally {
            this.isLoading.set(false);
        }
    }

    private async loadUsers(): Promise<void> {
        try {
            const users = await firstValueFrom(
                this.usersService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
            );

            const colors: Record<number, string> = {};
            users.forEach((u) => {
                if (u.color) colors[u.userId] = u.color;
            });
            this.colorByEmployeeId.set(colors);

            this.managers.set(
                users.filter(
                    (u) =>
                        u.status !== 'Unemployed' &&
                        u.roles?.some(
                            (r) => r.name === 'ROLE_JEFE' || r.name === 'ROLE_ADMIN'
                        )
                )
            );
        } catch {
            /* ignore */
        }
    }

    async loadJobs(): Promise<void> {
        this.isLoading.set(true);
        this.loadError.set(false);
        try {
            const jobs = await firstValueFrom(
                this.jobsService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
            );
            this.jobs.set(jobs);
        } catch (error: unknown) {
            if (this.destroyRef.destroyed) return;
            this.loadError.set(true);
            await Swal.fire({
                icon: 'error',
                title: 'No se pudieron cargar las evidencias',
                text: this.getErrorMessage(error),
                confirmButtonColor: '#12CFF4'
            });
        } finally {
            this.isLoading.set(false);
        }
    }

    readonly filteredJobs = computed(() => {
        const text = this.searchText().trim().toLowerCase();
        const managerId = this.managerFilter();
        const status = this.statusFilter();
        const priority = this.priorityFilter().trim();

        let list = [...this.jobs()].filter((job) => {
            const coincideTexto =
                (job.clientName || '').toLowerCase().includes(text) ||
                (job.description || '').toLowerCase().includes(text) ||
                (job.nameEmployee || '').toLowerCase().includes(text) ||
                (job.nameManager || '').toLowerCase().includes(text);

            const coincideJefe =
                managerId === 'ALL' || String(job.managerId) === managerId;

            const coincideEstado = status === 'ALL' || job.status === status;

            let coincidePrioridad = true;
            if (priority !== '') {
                const prioBuscada = parseInt(priority, 10);
                const prioJob =
                    job.priority !== null && job.priority !== undefined
                        ? Number(job.priority)
                        : 2;
                coincidePrioridad = prioJob === prioBuscada;
            }

            return (
                coincideTexto && coincideJefe && coincideEstado && coincidePrioridad
            );
        });

        list.sort((a, b) => {
            const timeB = this.jobTime(b.jobDate);
            const timeA = this.jobTime(a.jobDate);
            if (timeB !== timeA) return timeB - timeA;
            return b.jobId - a.jobId;
        });

        return list;
    });

    onSearch(e: Event): void {
        this.searchText.set((e.target as HTMLInputElement).value);
    }
    onManager(e: Event): void {
        this.managerFilter.set((e.target as HTMLSelectElement).value);
    }
    onStatus(e: Event): void {
        this.statusFilter.set((e.target as HTMLSelectElement).value);
    }
    onPriority(e: Event): void {
        this.priorityFilter.set((e.target as HTMLInputElement).value);
    }

    clearFilters(): void {
        this.searchText.set('');
        this.managerFilter.set('ALL');
        this.statusFilter.set('ALL');
        this.priorityFilter.set('');
    }

    countPhotos(job: Job): number {
        let n = 0;
        (job.updateJob || []).forEach((u) => {
            n += u.evidences?.length ?? 0;
        });
        return n;
    }

    countUpdates(job: Job): number {
        return job.updateJob?.length ?? 0;
    }

    openModal(job: Job): void {
        if (!job.updateJob?.length) {
            void Swal.fire({
                icon: 'info',
                title: 'Sin evidencias',
                text: `El proyecto de "${job.clientName}" no registra avances todavía.`,
                confirmButtonColor: '#12CFF4'
            });
            return;
        }
        this.selectedJob.set(job);
        this.backToHistory();
        void this.historyModal().fire();
    }

    onModalClosed(): void {
        this.selectedJob.set(null);
        this.backToHistory();
    }

    backToHistory(): void {
        this.photoUrl.set(null);
        this.photoLoading.set(false);
        this.photoError.set(false);
    }

    imageLoaded(url: string): void {
        this.loadedImages.update(values => new Set([...values, url]));
    }

    imageFailed(url: string): void {
        this.failedImages.update(values => new Set([...values, url]));
    }

    orderedUpdates(job: Job): JobUpdate[] {
        const list = [...(job.updateJob || [])];
        list.sort((a, b) => this.updateTime(b.date) - this.updateTime(a.date));
        return list;
    }

    formatUpdateDate(date: string | number[]): string {
        let d: Date;
        if (Array.isArray(date)) {
            d = new Date(
                date[0],
                date[1] - 1,
                date[2],
                date[3] || 0,
                date[4] || 0
            );
        } else {
            d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
        }
        if (Number.isNaN(d.getTime())) return 'Sin fecha';
        return d.toLocaleString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    isPdf(url: string): boolean {
        return (url || '').toLowerCase().includes('.pdf');
    }

    viewPhoto(url: string): void {
        this.photoLoading.set(true);
        this.photoError.set(false);
        this.photoUrl.set(url);
    }

    photoLoaded(): void { this.photoLoading.set(false); }
    photoFailed(): void {
        this.photoLoading.set(false);
        this.photoError.set(true);
    }

    statusBadge(status: string): { label: string; className: string } {
        switch (status) {
            case 'PENDING':
                return { label: 'Pendiente', className: 'badge badge-pending' };
            case 'IN_PROGRESS':
                return { label: 'En Progreso', className: 'badge badge-progress' };
            case 'COMPLETED':
                return { label: 'Completado', className: 'badge badge-done' };
            case 'CANCELLED':
                return { label: 'Cancelado', className: 'badge badge-cancel' };
            default:
                return { label: status || 'Sin estado', className: 'badge badge-low' };
        }
    }

    priorityBadge(priority?: number | null): { label: string; className: string } {
        const p = priority ?? 2;
        if (p === 0 || p === 1) {
            return { label: `${p} - Alta`, className: 'badge badge-high' };
        }
        if (p === 2) {
            return { label: `${p} - Normal`, className: 'badge badge-normal' };
        }
        return { label: `${p} - Baja`, className: 'badge badge-low' };
    }

    employeeColor(employeeId?: number): string {
        if (!employeeId) return '#CCCCCC';
        return this.colorByEmployeeId()[employeeId] || '#CCCCCC';
    }

    hexToRgba(hex: string, alpha: number): string {
        if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            return `rgba(200,200,200,${alpha})`;
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    formatDate(fecha: string | number[] | null | undefined): string {
        if (!fecha) return 'Sin fecha';
        if (Array.isArray(fecha)) {
            const [y, m, d] = fecha;
            return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
        }
        const parts = String(fecha).slice(0, 10).split('-');
        if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
        return String(fecha);
    }

    cleanDescription(desc?: string | null): string {
        if (!desc) return 'Sin descripción';
        if (desc.includes('[MATERIALES PRE-ASIGNADOS]:')) {
            return (
                desc.split('[MATERIALES PRE-ASIGNADOS]:')[0].trim() || 'Sin descripción'
            );
        }
        return desc;
    }

    fullUserName(u: User): string {
        return u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Sin nombre';
    }

    private jobTime(fecha: string | number[] | null | undefined): number {
        if (!fecha) return 0;
        if (Array.isArray(fecha)) {
            return new Date(fecha[0], fecha[1] - 1, fecha[2]).getTime();
        }
        const value = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T00:00:00` : fecha;
        return new Date(value).getTime() || 0;
    }

    private updateTime(date: string | number[]): number {
        if (Array.isArray(date)) {
            return new Date(
                date[0],
                date[1] - 1,
                date[2],
                date[3] || 0,
                date[4] || 0
            ).getTime();
        }
        return new Date(date).getTime();
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof HttpErrorResponse) {
            if (error.status === 0) return 'No se pudo conectar con el servidor.';
            if (error.status === 401) return 'Sesión inválida o expirada.';
            if (error.status === 403) return 'No tienes permisos.';
        }
        return 'No se pudo cargar el listado.';
    }
}