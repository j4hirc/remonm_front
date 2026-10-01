import { ChangeDetectorRef, Component, computed, DestroyRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { ReportDataService } from '../../core/services/report-data.service';
import { PdfExportService } from '../../core/services/pdf-export.service';
import { PayrollReport } from '../../core/models/reports.model';
import { buildPayrollReport } from '../../core/utils/report-calculations';
import { PayrollPdfComponent } from '../../shared/pdf-templates/nomina/nomina-pdf.component';

@Component({
  selector: 'app-jefe-nomina',
  standalone: true,
  imports: [PayrollPdfComponent, CurrencyPipe],
  templateUrl: './nomina.component.html',
  styleUrl: './nomina.component.css'
})
export class NominaJefeComponent implements OnInit {
  private readonly api = inject(ReportDataService);
  private readonly pdf = inject(PdfExportService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly template = viewChild.required(PayrollPdfComponent);
  private readonly anchorDate = new Date();
  private readonly data = signal<Awaited<ReturnType<typeof this.fetchData>> | null>(null);

  readonly offset = signal(0);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly downloadUrl = signal<string | null>(null);
  readonly filename = signal('');
  readonly generatedAt = signal('');
  readonly pdfSnapshot = signal<PayrollReport>({ start: '', end: '', employees: [], total: 0 });

  readonly report = computed<PayrollReport>(() => {
    const data = this.data();
    if (!data) return { start: '', end: '', employees: [], total: 0 };

    const built = buildPayrollReport(data.jobs, data.users, this.offset(), this.anchorDate);

    return {
      ...built,
      employees: built.employees.map(employee => ({
        ...employee,
        jobs: [...employee.jobs].sort(
          (a, b) => this.parseUsDate(a.date).getTime() - this.parseUsDate(b.date).getTime()
        )
      }))
    };
  });

  readonly empty = computed(() => this.report().employees.length === 0);
  readonly busy = computed(() => this.loading() || this.exporting());

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearDownload();
      if (Swal.isVisible()) Swal.close();
    });
  }

  ngOnInit(): void { void this.load(); }

  private parseUsDate(value: string): Date {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value?.trim() ?? '');
    if (!match) return new Date(value);
    const [, month, day, year] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  private fetchData() {
    return firstValueFrom(this.api.payroll().pipe(takeUntilDestroyed(this.destroyRef)));
  }

  async load(): Promise<void> {
    if (this.busy()) return;
    this.loading.set(true);
    this.error.set('');
    this.clearDownload();

    void Swal.fire({
      title: 'Cargando nómina...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      this.data.set(await this.fetchData());
      if (Swal.isVisible()) Swal.close();
    }
    catch {
      if (Swal.isVisible()) Swal.close();
      if (!this.destroyRef.destroyed) {
        this.notifyError('No se pudieron cargar los registros. Revisa tu sesión y vuelve a intentar.');
      }
    }
    finally {
      this.loading.set(false);
    }
  }

  changePeriod(delta: number): void {
    if (this.busy()) return;
    this.clearDownload();
    this.error.set('');

    if (Swal.isVisible()) {
      Swal.resetValidationMessage();
    }

    this.offset.update(value => value + delta);
  }

  async exportPdf(): Promise<void> {
    if (this.busy() || this.empty()) return;
    this.exporting.set(true);
    this.error.set('');
    this.clearDownload();

    if (Swal.isVisible()) {
      Swal.resetValidationMessage();
    }

    const report = this.report();
    const filename = `Nomina_Quincenal_${report.start.replaceAll('/', '-')}_al_${report.end.replaceAll('/', '-')}.pdf`;
    this.pdfSnapshot.set(report);
    this.generatedAt.set(new Date().toLocaleString('es-ES'));
    this.filename.set(filename);
    this.cdr.detectChanges();

    try {
      const blob = await this.pdf.create(this.template().nativeElement, filename);
      if (this.destroyRef.destroyed) return;
      this.downloadUrl.set(URL.createObjectURL(blob));
      if (!this.pdf.isIOS()) this.pdf.download(blob, filename);
    } catch (error: unknown) {
      if (!this.destroyRef.destroyed) {
        this.notifyError(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
      }
    } finally {
      this.exporting.set(false);
    }
  }

  private clearDownload(): void {
    const url = this.downloadUrl();
    if (url) URL.revokeObjectURL(url);
    this.downloadUrl.set(null);
  }

  private notifyError(message: string): void {
    this.error.set(message);
    if (Swal.isVisible()) Swal.showValidationMessage(message);
    else void Swal.fire({ icon: 'error', title: 'Aviso del sistema', text: message });
  }
}