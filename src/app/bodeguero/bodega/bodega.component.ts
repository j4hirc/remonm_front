import {
    ChangeDetectorRef,
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    OnDestroy, // AÑADIDO
    signal,
    viewChild
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { ReportDataService } from '../../core/services/report-data.service';
import { PdfExportService } from '../../core/services/pdf-export.service';
import { WarehouseReport } from '../../core/models/reports.model';
import { buildWarehouseReport } from '../../core/utils/report-calculations';
import { WarehousePdfComponent } from '../../shared/pdf-templates/bodega/bodega-pdf.component';

@Component({
    selector: 'app-bodeguero-bodega',
    standalone: true,
    imports: [WarehousePdfComponent],
    templateUrl: './bodega.component.html',
    styleUrl: './bodega.component.css'
})
export class BodegaBodegueroComponent implements OnInit, OnDestroy {
    private readonly api = inject(ReportDataService);
    private readonly pdf = inject(PdfExportService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly template = viewChild.required(WarehousePdfComponent);
    private readonly anchorDate = new Date();
    private readonly data = signal<Awaited<ReturnType<typeof this.fetchData>> | null>(null);

    readonly offset = signal(0);
    readonly loading = signal(false);
    readonly exporting = signal(false);
    readonly error = signal('');
    readonly filename = signal('');
    readonly generatedAt = signal('');
    readonly pdfSnapshot = signal<WarehouseReport>({ date: '', label: '', orders: [] });

    readonly report = computed<WarehouseReport>(() => {
        const data = this.data();
        return data
            ? buildWarehouseReport(data.jobs, data.users, data.materials, this.offset(), this.anchorDate)
            : { date: '', label: '', orders: [] };
    });

    readonly empty = computed(() => this.report().orders.length === 0);
    readonly busy = computed(() => this.loading() || this.exporting());

    ngOnInit(): void {
        void this.load();
    }

    // AÑADIDO: Libera la pantalla si cambias de pestaña mientras carga
    ngOnDestroy(): void {
        Swal.close();
    }

    private fetchData() {
        return firstValueFrom(this.api.warehouse().pipe(takeUntilDestroyed(this.destroyRef)));
    }

    async load(): Promise<void> {
        if (this.busy()) return;
        this.loading.set(true);
        this.error.set('');
        
        // MODAL DE CARGA
        void Swal.fire({
            title: 'Cargando órdenes de bodega...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });
        
        try {
            const data = await this.fetchData();
            if (this.destroyRef.destroyed) return;
            this.data.set(data);
            Swal.close(); // CERRAMOS EL MODAL CON ÉXITO
        } catch {
            if (this.destroyRef.destroyed) return;
            Swal.close(); // Cerramos el loading antes de mostrar el error
            if (!this.destroyRef.destroyed) {
                this.notifyError('No se pudieron cargar los registros. Revisa tu sesión y vuelve a intentar.');
            }
        } finally {
            this.loading.set(false);
        }
    }

    changePeriod(delta: number): void {
        if (this.busy()) return;
        
        this.error.set('');
        if (Swal.isVisible()) {
            Swal.resetValidationMessage();
        }
        this.offset.update((value) => value + delta);
    }

    async exportPdf(): Promise<void> {
        if (this.busy() || this.empty()) return;
        this.exporting.set(true);
        this.error.set('');
        
        if (Swal.isVisible()) {
            Swal.resetValidationMessage();
        }
        const report = this.report();
        const filename = `Ordenes_Bodega_Global_${report.date.replaceAll('/', '-')}.pdf`;
        this.pdfSnapshot.set(report);
        this.generatedAt.set(new Date().toLocaleString('es-ES'));
        this.filename.set(filename);
        this.cdr.detectChanges();
        
        try {
            const blob = await this.pdf.create(this.template().nativeElement, filename);
            if (this.destroyRef.destroyed) return;
            
            // Descarga directa del PDF
            this.pdf.download(blob, filename);
            
        } catch (error: unknown) {
            if (!this.destroyRef.destroyed) {
                this.notifyError(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
            }
        } finally {
            this.exporting.set(false);
        }
    }

    private notifyError(message: string): void {
        this.error.set(message);
        if (Swal.isVisible()) Swal.showValidationMessage(message);
        else void Swal.fire({ icon: 'error', title: 'Aviso del sistema', text: message });
    }
}