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
  selector: 'app-nomina', 
  standalone: true,
  imports: [PayrollPdfComponent, CurrencyPipe],
  templateUrl: './nomina.component.html', 
  styleUrl: './nomina.component.css'
})
export class NominaComponent implements OnInit {
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
    return data ? buildPayrollReport(data.jobs, data.users, this.offset(), this.anchorDate) : { start: '', end: '', employees: [], total: 0 };
  });
  
  readonly empty = computed(() => this.report().employees.length === 0);
  readonly busy = computed(() => this.loading() || this.exporting());

  constructor() { 
    this.destroyRef.onDestroy(() => {
      this.clearDownload();
      if (Swal.isVisible()) Swal.close(); // AÑADIDO: Libera la pantalla al cambiar de pestaña
    }); 
  }
  
  ngOnInit(): void { void this.load(); }
  
  private fetchData() {
    return firstValueFrom(this.api.payroll().pipe(takeUntilDestroyed(this.destroyRef)));
  }
  
  async load(): Promise<void> {
    if (this.busy()) return;
    this.loading.set(true);
    this.error.set('');
    this.clearDownload();

    // MODAL DE CARGA AÑADIDO
    void Swal.fire({
      title: 'Cargando nómina...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try { 
      this.data.set(await this.fetchData()); 
      if (Swal.isVisible()) Swal.close(); // Cierra el modal de carga si fue exitoso
    }
    catch { 
      if (Swal.isVisible()) Swal.close(); // Cerramos el loading antes de mostrar el error
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
    
    // CORRECCIÓN: Validar visibilidad antes de resetear
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
    
    // CORRECCIÓN: Validar visibilidad antes de resetear
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
      // En iOS se utiliza el enlace visible: lo abre un gesto del usuario.
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