import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';
import {
  SwalComponent,
  SwalPortalDirective,
  SwalPortalTargets
} from '@sweetalert2/ngx-sweetalert2';

import { Job, JobUpdate } from '../../core/models/job.model';
import { User } from '../../core/models/user.model';
import { JobsService } from '../../core/services/jobs.service';
import { UsersService } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-employee-evidencias',
  standalone: true,
  imports: [SwalComponent, SwalPortalDirective],
  templateUrl: './evidencias.component.html',
  styleUrl: './evidencias.component.css'
})
export class EvidenciasEmployeeComponent implements OnInit {
  private readonly jobsService = inject(JobsService);
  private readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly historyModal =
    viewChild.required<SwalComponent>('historyModal');
  readonly swalTargets = inject(SwalPortalTargets);

  readonly jobs = signal<readonly Job[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal(false);

  readonly searchText = signal('');
  readonly statusFilter = signal('ALL');

  readonly selectedJob = signal<Job | null>(null);
  readonly photoUrl = signal<string | null>(null);
  readonly photoLoading = signal(false);
  readonly photoError = signal(false);
  readonly failedImages = signal<ReadonlySet<string>>(new Set());
  readonly loadedImages = signal<ReadonlySet<string>>(new Set());

  readonly selectedUpdates = computed(() => {
    const job = this.selectedJob();
    return job ? this.orderedUpdates(job) : [];
  });

  readonly filteredJobs = computed(() => {
    const text = this.searchText().trim().toLowerCase();
    const status = this.statusFilter();

    let list = [...this.jobs()].filter((job) => {
      const coincideTexto =
        (job.clientName || '').toLowerCase().includes(text) ||
        (job.description || '').toLowerCase().includes(text) ||
        (job.nameManager || '').toLowerCase().includes(text);
      const coincideEstado = status === 'ALL' || job.status === status;
      return coincideTexto && coincideEstado;
    });

    list.sort((a, b) => {
      const timeB = this.jobTime(b.jobDate);
      const timeA = this.jobTime(a.jobDate);
      if (timeB !== timeA) return timeB - timeA;
      return b.jobId - a.jobId;
    });

    return list;
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.loadJobs();

      const jobIdParam = this.route.snapshot.queryParamMap.get('jobId');
      if (jobIdParam) {
        const id = parseInt(jobIdParam, 10);
        const job = this.jobs().find((j) => j.jobId === id);
        if (job) {
          if (job.updateJob && job.updateJob.length > 0) {
            this.openModal(job);
          } else {
            await Swal.fire({
              icon: 'info',
              title: 'Sin evidencias',
              text: `El proyecto de "${job.clientName}" no registra avances fotográficos todavía.`,
              confirmButtonColor: '#0277bd'
            });
          }
        }
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadJobs(): Promise<void> {
    this.loadError.set(false);
    try {
      const email = (this.authService.email() || '').toLowerCase().trim();

      const users = await firstValueFrom(
        this.usersService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
      );
      const yo = users.find(
        (u: User) => (u.email || '').toLowerCase().trim() === email
      );
      if (!yo) {
        this.loadError.set(true);
        await Swal.fire('Error', 'No se pudo identificar tu cuenta.', 'error');
        return;
      }

      const all = await firstValueFrom(
        this.jobsService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
      );
      this.jobs.set(all.filter((j) => j.employeeId === yo.userId));
    } catch {
      this.loadError.set(true);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron cargar las evidencias.',
        confirmButtonColor: '#0277bd'
      });
    }
  }

  onSearch(e: Event): void {
    this.searchText.set((e.target as HTMLInputElement).value);
  }

  onStatus(e: Event): void {
    this.statusFilter.set((e.target as HTMLSelectElement).value);
  }

  clearFilters(): void {
    this.searchText.set('');
    this.statusFilter.set('ALL');
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
        confirmButtonColor: '#0277bd'
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
    this.loadedImages.update((v) => new Set([...v, url]));
  }

  imageFailed(url: string): void {
    this.failedImages.update((v) => new Set([...v, url]));
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
      d = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? new Date(`${date}T00:00:00`)
        : new Date(date);
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

  photoLoaded(): void {
    this.photoLoading.set(false);
  }

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
        return { label: status || 'Sin estado', className: 'badge badge-cancel' };
    }
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

  private jobTime(fecha: string | number[] | null | undefined): number {
    if (!fecha) return 0;
    if (Array.isArray(fecha)) {
      return new Date(fecha[0], fecha[1] - 1, fecha[2]).getTime();
    }
    return new Date(fecha).getTime() || 0;
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
}