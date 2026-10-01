import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

import { JobsService } from '../../core/services/jobs.service';
import { UsersService } from '../../core/services/users.service';
import { AuthService } from '../../core/services/auth.service';
import {
  JobUpdatesService,
  JobUpdateRequest
} from '../../core/services/job-updates.service';
import { Job } from '../../core/models/job.model';
import { User } from '../../core/models/user.model';


import { buildReportMaterialRows, lineTotal, materialChanged, ReportMaterialRow } from '../../core/services/utils/report-material-comparison';

@Component({
  selector: 'app-employee-reporte',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte.component.html',
  styleUrl: './reporte.component.css'
})
export class ReporteEmployeeComponent
  implements OnInit, AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly jobsService = inject(JobsService);
  private readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  private readonly updatesService = inject(JobUpdatesService);

  private readonly canvasRef =
    viewChild<ElementRef<HTMLCanvasElement>>('signaturePad');

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly job = signal<Job | null>(null);
  readonly employeeId = signal<number | null>(null);
  readonly employeeName = signal('');

  status = 'IN_PROGRESS';
  comment = '';
  private manualModifications = false;
  get hasModifications(): boolean { return this.manualModifications || this.materialsChanged(); }
  set hasModifications(value: boolean) { this.manualModifications = value; }

  readonly necessary = signal<ReportMaterialRow[]>([]);
  readonly materialsChanged = computed(() => this.necessary().some(materialChanged));
  readonly materialChanged = materialChanged;
  readonly lineTotal = lineTotal;
  readonly photoFiles = signal<File[]>([]);
  readonly photoPreviews = signal<string[]>([]);

  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private canvasReady = false;

  ngOnInit(): void {
    void this.bootstrap();
  }

  ngAfterViewInit(): void {
    this.waitForCanvasAndInit();
  }

  ngOnDestroy(): void {
    this.photoPreviews().forEach((u) => URL.revokeObjectURL(u));
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const jobId = parseInt(
        this.route.snapshot.queryParamMap.get('jobId') || '',
        10
      );
      if (!jobId) {
        await Swal.fire('Error', 'Falta el trabajo a reportar.', 'error');
        void this.router.navigate(['/employee/calendario']);
        return;
      }

      const email = (this.authService.email() || '').toLowerCase().trim();
      const [users, job] = await Promise.all([
        firstValueFrom(this.usersService.getAll()),
        firstValueFrom(this.jobsService.getById(jobId))
      ]);

      const yo = users.find(
        (u: User) => (u.email || '').toLowerCase().trim() === email
      );
      if (!yo || job.employeeId !== yo.userId) {
        await Swal.fire('Error', 'Este trabajo no te pertenece.', 'error');
        void this.router.navigate(['/employee/calendario']);
        return;
      }
      if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
        await Swal.fire(
          'Bloqueado',
          'Este proyecto ya está finalizado.',
          'info'
        );
        void this.router.navigate(['/employee/calendario']);
        return;
      }

      this.employeeId.set(yo.userId);
      this.employeeName.set(
        `${yo.firstName ?? ''} ${yo.lastName ?? ''}`.trim() || yo.email
      );
      this.job.set(job);

      this.necessary.set(buildReportMaterialRows(job));
    } catch {
      await Swal.fire('Error', 'No se pudo cargar el trabajo.', 'error');
      void this.router.navigate(['/employee/calendario']);
    } finally {
      this.loading.set(false);
      this.waitForCanvasAndInit();
    }
  }

  necessaryTotal(): number {
    return this.necessary().reduce((s, r) => s + lineTotal(r.quantity, r.price), 0);
  }

  updateQty(materialId: number, qty: number): void {
    if (this.saving()) return;
    const cantidadSegura = Number.isFinite(qty) && qty >= 0 ? qty : 0;
    this.necessary.update((rows) =>
      rows.map((r) =>
        r.materialId === materialId
          ? { ...r, quantity: cantidadSegura }
          : r
      )
    );
  }

  removeNec(materialId: number): void {
    // Keep the original row for comparison and allow restoring its quantity.
    this.updateQty(materialId, 0);
  }

  onPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    const next = [...this.photoFiles(), ...files];
    this.photoFiles.set(next);
    this.photoPreviews.set(next.map((f) => URL.createObjectURL(f)));
    input.value = '';
  }

  removePhoto(index: number): void {
    const files = [...this.photoFiles()];
    const previews = [...this.photoPreviews()];
    URL.revokeObjectURL(previews[index]);
    files.splice(index, 1);
    previews.splice(index, 1);
    this.photoFiles.set(files);
    this.photoPreviews.set(previews);
  }

  private waitForCanvasAndInit(maxTries = 30, intervalMs = 50): void {
    if (this.canvasReady) return;
    let tries = 0;

    const tick = () => {
      const canvas = this.canvasRef()?.nativeElement;
      if (canvas && canvas.offsetWidth > 0) {
        this.initCanvas(canvas);
        return;
      }
      tries++;
      if (tries >= maxTries) {
        if (canvas) this.initCanvas(canvas);
        return;
      }
      requestAnimationFrame(() => setTimeout(tick, intervalMs));
    };

    tick();
  }

  private initCanvas(canvas: HTMLCanvasElement): void {
    this.canvasReady = true;

    const width = canvas.offsetWidth || 320;
    const height = canvas.offsetHeight || 140;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = '#0F2D4A';

    const pos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX =
        'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY =
        'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const start = (e: Event) => {
      e.preventDefault();
      this.drawing = true;
      const p = pos(e as MouseEvent | TouchEvent);
      this.ctx?.beginPath();
      this.ctx?.moveTo(p.x, p.y);
    };
    const move = (e: Event) => {
      if (!this.drawing || !this.ctx) return;
      e.preventDefault();
      const p = pos(e as MouseEvent | TouchEvent);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
    };
    const end = () => {
      this.drawing = false;
      this.ctx?.beginPath();
    };

    canvas.onmousedown = start;
    canvas.onmousemove = move;
    canvas.onmouseup = end;
    canvas.onmouseleave = end;
    canvas.ontouchstart = start;
    canvas.ontouchmove = move;
    canvas.ontouchend = end;
  }

  clearSignature(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.ctx) return;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private isCanvasBlank(): boolean {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return true;
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    return canvas.toDataURL() === blank.toDataURL();
  }

  private async buildPdfBlob(job: Job, comment: string, total: number): Promise<Blob> {
    const { buildEvidenceReportPdf } = await import('../../core/services/utils/evidence-report-pdf');
    return buildEvidenceReportPdf({
      clientName: job.clientName?.trim() || 'Sin asignar',
      address: job.address?.trim() || 'No registrada',
      buildingNumber: job.buildingNumber?.trim() || 'No registrado',
      apartment: job.apartment?.trim() || 'No registrado',
      clientPhone: job.clientPhone?.trim() || 'No registrado',
      employeeName: this.employeeName(),
      status: this.getReportedStatus(),
      comment,
      total,
      initialTotal: job.originalAssignmentAvailable ? job.initialPay ?? null : null,
      originalAssignmentAvailable: job.originalAssignmentAvailable === true,
      date: new Date(),
      materials: this.necessary().map(row => ({ ...row, changed: materialChanged(row) })),
      photos: [...this.photoFiles()],
      signature: this.canvasRef()?.nativeElement.toDataURL('image/png') || '',
      logoUrl: new URL('img/logonegro.png', document.baseURI).href
    });
  }

  getReportedStatus(): string {
    if (this.hasModifications || this.job()?.status === 'REVIEW') {
      return 'REVIEW';
    }

    return this.status;
  }

  async submit(): Promise<void> {
    const job = this.job();
    const empId = this.employeeId();
    if (!job || !empId || this.saving()) return;

    if (this.isCanvasBlank()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Falta tu firma',
        text: 'Debes firmar el reporte.',
        confirmButtonColor: '#00B8A9'
      });
      return;
    }
    if (this.photoFiles().length === 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Faltan fotos',
        text: 'Debes adjuntar al menos una imagen.',
        confirmButtonColor: '#00B8A9'
      });
      return;
    }

    this.saving.set(true);
    void Swal.fire({
      title: 'Procesando...',
      text: 'Generando PDF y guardando avance...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      let comment = this.comment.trim();
      if (this.hasModifications) {
        comment =
          '⚠️ [ALERTA DE OFICINA]: Se hicieron modificaciones a la orden original que requieren revisión del Manager.\n\n' +
          comment;
      }

      const materials = this.necessary().map((r) => ({
        materialId: r.materialId,
        quantity: r.quantity,
        unit: r.unit || 'N/A'
      }));
      const materialIds = materials.map((m) => m.materialId);
      const newPrice = this.necessaryTotal();

      const pdfBlob = await this.buildPdfBlob(job, comment, newPrice);
      const safeName = (job.clientName || 'Trabajo').replace(
        /[^a-zA-Z0-9]/g,
        '_'
      );
      const pdfFile = new File([pdfBlob], `Reporte_${safeName}.pdf`, {
        type: 'application/pdf'
      });

      const payload: JobUpdateRequest = {
        comment,
        jobId: job.jobId,
        employeeId: empId,
        hasModifications: this.hasModifications,
        status: this.getReportedStatus(),
        materials,
        materialIds,
        newPrice
      };

      const files = [...this.photoFiles(), pdfFile];
      await firstValueFrom(this.updatesService.create(payload, files));

      await Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        html: `
          <p>El reporte y las fotos se guardaron correctamente.</p>
          <button id="btnSharePdf" type="button"
            style="width:100%;padding:12px;margin-top:12px;border:none;border-radius:8px;background:#00B8A9;color:#fff;font-weight:700;cursor:pointer;">
            Descargar / Compartir PDF
          </button>
        `,
        showConfirmButton: true,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#0F2D4A',
        didOpen: () => {
          document
            .getElementById('btnSharePdf')
            ?.addEventListener('click', async () => {
              const isIOS =
                /iPad|iPhone|iPod/.test(navigator.userAgent) &&
                !(window as any).MSStream;

              if (isIOS) {
                try {
                  if (
                    navigator.canShare &&
                    navigator.canShare({ files: [pdfFile] })
                  ) {
                    await navigator.share({
                      files: [pdfFile],
                      title: pdfFile.name
                    });
                    return;
                  }
                } catch (e) {
                  console.warn('Compartir cancelado o no soportado', e);
                }
              }

              const url = URL.createObjectURL(pdfBlob);
              const a = document.createElement('a');
              a.href = url;
              a.download = pdfFile.name;
              a.click();
              URL.revokeObjectURL(url);
            });
        }
      });

      void this.router.navigate(['/employee/calendario']);
    } catch (err: unknown) {
      console.error(err);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo guardar el reporte. Revisa la conexión e inténtalo de nuevo.',
        confirmButtonColor: '#00B8A9'
      });
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigate(['/employee/calendario']);
  }
}