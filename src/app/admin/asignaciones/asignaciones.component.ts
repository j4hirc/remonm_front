import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, exhaustMap, timer } from 'rxjs';
import { Assignment, AssignmentsService, assignmentLabel, TrackedJob } from '../../core/services/assignments.service';

@Component({
  standalone: true,
  templateUrl: './asignaciones.component.html',
  styleUrl: './asignaciones.component.css'
})
export class AsignacionesComponent {
  private readonly api = inject(AssignmentsService);
  private readonly jobs = signal<TrackedJob[]>([]);
  private delta = 0;
  readonly now = signal(Date.now());
  readonly filter = signal('');
  readonly search = signal('');
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly label = assignmentLabel;
  readonly states = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REJECTED', 'ADMIN', 'NONE'];
  readonly jobLabels: Record<string,string> = {
    PENDING:'Pendiente', REVIEW:'En revisión', IN_PROGRESS:'En Progreso (Pago)', COMPLETED:'Completado', CANCELLED:'Cancelado'
  };
  private readonly formatter = new Intl.DateTimeFormat('es-US', {
    timeZone: 'America/Chicago', year:'numeric', month:'short', day:'numeric',
    hour:'numeric', minute:'2-digit', hour12:true
  });
  readonly visible = computed(() => {
    const filter = this.filter();
    const search = this.search().trim().toLowerCase();
    return this.jobs().filter(j => {
      const status = this.status(this.current(j));
      const match = !filter || status === filter ||
        (['REJECTED','EXPIRED'].includes(filter) && j.history.some(a => a.status === filter));
      return match && [j.jobId, j.client, j.employee, j.nextEmployee, ...j.history.map(a => a.employeeName)]
        .join(' ').toLowerCase().includes(search);
    });
  });

  constructor() {
    timer(0, 1000).pipe(takeUntilDestroyed()).subscribe(() => this.now.set(Date.now() + this.delta));
    timer(0, 15000).pipe(exhaustMap(() => this.api.overview().pipe(catchError(() => {
      this.error.set(true);
      this.loading.set(false);
      return EMPTY;
    }))), takeUntilDestroyed()).subscribe(data => {
      this.delta = Date.parse(data.now) - Date.now();
      this.now.set(Date.now() + this.delta);
      this.jobs.set(data.jobs);
      this.error.set(false);
      this.loading.set(false);
    });
  }

  current(job: TrackedJob) { return job.history.find(a => a.id === job.currentId); }

  status(a?: Assignment): string {
    if (!a) return 'NONE';
    if (a.status !== 'PENDING') return a.status;
    if (a.expiresAt && this.now() >= Date.parse(a.expiresAt)) return 'EXPIRED';
    return 'PENDING';
  }

  date(value?: string | null) { return value ? this.formatter.format(new Date(value)) : '—'; }

  remaining(a: Assignment): string {
    const state = this.status(a);
    if (state !== 'PENDING' || !a.expiresAt) return '';
    if (a.publishesAt && this.now() < Date.parse(a.publishesAt)) {
      return 'Ya puede responder · El plazo inicia el ' + this.date(a.publishesAt);
    }
    const end = a.expiresAt;
    const secs = Math.max(0, Math.ceil((Date.parse(end) - this.now()) / 1000));
    const duration = [Math.floor(secs / 3600), Math.floor(secs / 60) % 60, secs % 60]
      .map(n => String(n).padStart(2,'0')).join(':');
    return 'Vence en ' + duration;
  }
}
