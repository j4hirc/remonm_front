import {
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  EMPTY,
  exhaustMap,
  firstValueFrom,
  timer
} from 'rxjs';
import { AssignmentPreviewService } from '../../core/services/assignment-preview.service';
import {
  Assignment,
  AssignmentsService
} from '../../core/services/assignments.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-assignment-inbox',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section
      class="assignments"
      aria-label="Asignaciones pendientes"
    >
      <h2>Trabajos por aceptar</h2>

      <p>
        Revisa los detalles y responde antes del vencimiento indicado.
      </p>

      @if (message()) {
        <p role="status">{{ message() }}</p>
      }

      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }

      @if (loading()) {
        <p>Cargando asignaciones…</p>
      }

      @for (a of assignments(); track a.id) {
        <article>
          <h3>#{{ a.jobId }} · {{ a.clientName }}</h3>
          <p>{{ a.address }}</p>

          <p>
            Responder antes de:
            <strong>
              {{ a.expiresAt | date:'MM/dd/yyyy HH:mm' }}
            </strong>
            (hora local)
          </p>

          @if (expired(a)) {
    <p>Plazo vencido. El sistema está actualizando la asignación.</p>
} @else {
    <button
        type="button"
        [disabled]="busy() !== null"
        (click)="previewAssignment(a)">
        Ver detalle y responder
    </button>
}
        </article>
      } @empty {
        @if (!loading() && !error()) {
          <p>No tienes asignaciones pendientes de respuesta.</p>
        }
      }
    </section>
  `,
  styles: [`
    .assignments {
      background: #fff;
      border: 1px solid #d9e3e8;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 20px;
      color: #20333e;
    }

    h2 {
      font-size: 1.2rem;
      margin-top: 0;
    }

    h3 {
      font-size: 1rem;
    }

    article {
      border-top: 1px solid #d9e3e8;
      padding: 12px 0;
      overflow-wrap: anywhere;
    }

    button {
      padding: 10px 16px;
      margin: 4px 8px 4px 0;
      border: 1px solid #0e686e;
      border-radius: 8px;
      background: #fff;
      color: #0e686e;
      cursor: pointer;
    }

    button:first-of-type {
      background: #0e686e;
      color: white;
    }

    button:disabled {
      opacity: .5;
      cursor: wait;
    }

    [role=alert] {
      color: #a52222;
    }
  `]
})
export class AssignmentInboxComponent {
  private readonly api = inject(AssignmentsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly preview = inject(AssignmentPreviewService);
  readonly changed = output<void>();

  readonly assignments = signal<Assignment[]>([]);
  readonly loading = signal(true);
  readonly busy = signal<number | null>(null);
  readonly confirmReject = signal<number | null>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly now = signal(Date.now());

  private readonly router = inject(Router);

  readonly previewInPlace = input(false);
  readonly previewRequested = output<number>();

  previewAssignment(a: Assignment): void {
    if (this.busy() !== null) return;

    if (this.previewInPlace()) {
      this.previewRequested.emit(a.jobId);
      return;
    }

    // Desde el dashboard abre el calendario y su ventana original.
    void this.router.navigate(['/employee/calendario'], {
      queryParams: { previewAssignment: a.jobId }
    });
  }

  constructor() {
    timer(0, 15000).pipe(
      exhaustMap(() =>
        this.api.mine().pipe(
          catchError(() => {
            this.error.set(
              'No se pudieron consultar las asignaciones. ' +
              'Se reintentará automáticamente.'
            );

            this.loading.set(false);
            return EMPTY;
          })
        )
      ),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(rows => {
      this.assignments.set(rows);
      this.error.set('');
      this.loading.set(false);
      this.now.set(Date.now());
    });
  }

  expired(a: Assignment): boolean {
    return !!a.expiresAt && Date.parse(a.expiresAt) <= this.now();
  }

  async respond(
    a: Assignment,
    decision: 'ACCEPT' | 'REJECT'
  ): Promise<void> {
    if (this.busy() !== null) {
      return;
    }

    this.busy.set(a.id);
    this.error.set('');

    try {
      const result = await firstValueFrom(
        this.api.respond(a.id, decision)
      );

      this.message.set(result.message);
      this.confirmReject.set(null);

      this.assignments.update(
        rows => rows.filter(row => row.id !== a.id)
      );

      this.changed.emit();
    } catch {
      this.error.set(
        'No se pudo registrar la respuesta. ' +
        'Actualiza la página y revisa si el trabajo sigue disponible.'
      );
    } finally {
      this.busy.set(null);
    }
  }
}