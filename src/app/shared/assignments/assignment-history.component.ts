import {
  Component,
  DestroyRef,
  inject,
  input,
  signal
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  takeUntilDestroyed,
  toObservable
} from '@angular/core/rxjs-interop';
import {
  catchError,
  of,
  switchMap,
  tap
} from 'rxjs';

import {
  Assignment,
  AssignmentsService,
  assignmentLabel
} from '../../core/services/assignments.service';

@Component({
  selector: 'app-assignment-history',
  standalone: true,
  imports: [DatePipe],
  template: `
    <details class="history">
      <summary>Historial de asignaciones</summary>

      @if (loading()) {
        <p>Cargando historial…</p>
      }

      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }

      @for (a of attempts(); track a.id) {
        <article>
          <strong>
            {{ a.employeeName }} · {{ label(a.status) }}
          </strong>

          <p>
            Asignado:
            {{ a.assignedAt | date:'dd/MM/yyyy HH:mm' }}
          </p>

          @if (a.expiresAt) {
            <p>
              Plazo:
              {{ a.expiresAt | date:'dd/MM/yyyy HH:mm' }}
            </p>
          }

          @if (a.respondedAt) {
            <p>
              Respuesta/cierre:
              {{ a.respondedAt | date:'dd/MM/yyyy HH:mm' }}
            </p>
          }

          <p>{{ a.reason }}</p>
        </article>
      } @empty {
        @if (!error() && !loading()) {
          <p>
            Este trabajo todavía no tiene
            asignaciones registradas con plazo.
          </p>
        }
      }

      <small>
        Fechas en tu hora local.
        Vuelve a abrir el trabajo para actualizar el historial.
      </small>
    </details>
  `,
  styles: [`
    .history {
      padding: 12px;
      border: 1px solid #ccd9df;
      border-radius: 8px;
      margin: 12px 0;
      text-align: left;
      overflow-wrap: anywhere;
    }

    summary {
      cursor: pointer;
      font-weight: 600;
    }

    article {
      border-top: 1px solid #ddd;
      padding: 10px 0;
    }

    p {
      margin: 4px 0;
      font-size: .9rem;
    }
  `]
})
export class AssignmentHistoryComponent {
  readonly jobId = input.required<number>();

  private readonly api = inject(AssignmentsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly attempts = signal<Assignment[]>([]);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly label = assignmentLabel;

  constructor() {
    toObservable(this.jobId).pipe(
      tap(() => {
        this.error.set('');
        this.loading.set(true);
        this.attempts.set([]);
      }),
      switchMap(id =>
        this.api.history(id).pipe(
          catchError(() => {
            this.error.set('No se pudo cargar el historial.');
            return of([]);
          })
        )
      ),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(rows => {
      this.attempts.set(rows);
      this.loading.set(false);
    });
  }
}