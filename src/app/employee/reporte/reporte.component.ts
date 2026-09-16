import { jobLocation } from '../../core/utils/job-location';
import {
  AfterViewInit,
  Component,
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
import { MaterialsService } from '../../core/services/materials.service';
import { AuthService } from '../../core/services/auth.service';
import {
  JobUpdatesService,
  JobUpdateRequest
} from '../../core/services/job-updates.service';
import { Job } from '../../core/models/job.model';
import { Material } from '../../core/models/material.model';
import { User } from '../../core/models/user.model';

declare const html2pdf: any;

interface NecRow {
  materialId: number;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

@Component({
  selector: 'app-employee-reporte',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte.component.html',
  styleUrl: './reporte.component.css'
})
export class ReporteEmployeeComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly jobsService = inject(JobsService);
  private readonly usersService = inject(UsersService);
  private readonly materialsService = inject(MaterialsService);
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
  hasModifications = false;

  readonly necessary = signal<NecRow[]>([]);
  readonly photoFiles = signal<File[]>([]);
  readonly photoPreviews = signal<string[]>([]);

  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private canvasReady = false;
  private allMaterials: Material[] = [];
  private originalMaterialIds = new Set<number>();

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
      const [users, mats, job] = await Promise.all([
        firstValueFrom(this.usersService.getAll()),
        firstValueFrom(this.materialsService.getAll()),
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
      this.allMaterials = mats;
      this.job.set(job);

      const rows: NecRow[] = [];
      const ids = new Set<number>();
      (job.materials || []).forEach((m: any) => {
        const id = m.materialId;
        ids.add(id);
        const info = mats.find((x) => x.materialId === id);
        rows.push({
          materialId: id,
          name: m.name || info?.name || 'Material',
          quantity: m.quantity || 1,
          unit: m.unit && m.unit !== 'N/A' ? m.unit : info?.unit || '',
          price: info?.price ?? m.price ?? 0
        });
      });
      this.originalMaterialIds = ids;
      this.necessary.set(rows);
    } catch {
      await Swal.fire('Error', 'No se pudo cargar el trabajo.', 'error');
      void this.router.navigate(['/employee/calendario']);
    } finally {
      this.loading.set(false);
      this.waitForCanvasAndInit();
    }
  }

  necessaryTotal(): number {
    return this.necessary().reduce((s, r) => s + r.quantity * r.price, 0);
  }

  updateQty(materialId: number, qty: number): void {
    this.necessary.update((rows) =>
      rows.map((r) =>
        r.materialId === materialId
          ? { ...r, quantity: Math.max(1, qty || 1) }
          : r
      )
    );
  }

  removeNec(materialId: number): void {
    if (!this.originalMaterialIds.has(materialId)) return;
    this.necessary.update((rows) =>
      rows.filter((r) => r.materialId !== materialId)
    );
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

  private async fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  /**
   * IGUAL QUE EN employee-dashboard.js: en vez de construir el HTML del PDF
   * con JS (createElement/innerHTML en memoria), usamos la plantilla que ya
   * está en el DOM (ver reporte.component.html, bloque #pdfWrapper /
   * #pdfTemplate) y solo la RELLENAMOS con document.getElementById(...),
   * igual que hacía guardarReporteYPdf() en el JS original.
   */
  private async buildPdfBlob(
    job: Job,
    comment: string,
    total: number
  ): Promise<Blob> {
    const photos = await Promise.all(
      this.photoFiles().map((f) => this.fileToDataUrl(f))
    );
    const signatureDataUrl =
      this.canvasRef()?.nativeElement.toDataURL('image/png') || '';

    const materials = this.necessary().map((r) => ({
      name: r.name,
      quantityLabel: `${r.quantity}${r.unit ? ' ' + r.unit : ''}`,
      unitPrice: r.price,
      subtotal: r.quantity * r.price
    }));
    const totalMateriales = materials.reduce((s, m) => s + m.subtotal, 0);

    const pdfWrapper = document.getElementById('pdfWrapper') as HTMLElement;
    const pdfTemplate = document.getElementById('pdfTemplate') as HTMLElement;

    if (!pdfWrapper || !pdfTemplate) {
      throw new Error(
        'No se encontró la plantilla #pdfWrapper/#pdfTemplate en el HTML.'
      );
    }

    (document.getElementById('pdfJobName') as HTMLElement).textContent =
      job.clientName || 'Sin asignar';
    (document.getElementById('pdfAddress') as HTMLElement).textContent =
      jobLocation(job);
    (document.getElementById('pdfClientPhone') as HTMLElement).textContent =
      job.clientPhone || 'No registrado';
    (document.getElementById('pdfEmployee') as HTMLElement).textContent =
      this.employeeName();
    (document.getElementById('pdfJobPay') as HTMLElement).textContent =
      `$${total.toFixed(2)}`;
    (document.getElementById('pdfStatus') as HTMLElement).textContent =
      this.status === 'COMPLETED' ? 'Completado' : 'En Progreso';

    const hoy = new Date();
    (document.getElementById('pdfDate') as HTMLElement).textContent =
      `${String(hoy.getMonth() + 1).padStart(2, '0')}/${String(
        hoy.getDate()
      ).padStart(2, '0')}/${hoy.getFullYear()}`;
    (document.getElementById('pdfComment') as HTMLElement).textContent =
      comment;

    const pdfMaterialsBody = document.getElementById(
      'pdfMaterialsBody'
    ) as HTMLElement;
    pdfMaterialsBody.innerHTML = materials.length
      ? materials
          .map(
            (m) => `
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd; color: #2E3238;">${m.name}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #2E3238;">${m.quantityLabel}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #2E3238;">$${m.unitPrice.toFixed(2)}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #198754;">$${m.subtotal.toFixed(2)}</td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="4" style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #666;">No se reportaron materiales.</td></tr>`;

    (document.getElementById('pdfTotalMateriales') as HTMLElement).textContent =
      `$${totalMateriales.toFixed(2)}`;
    (document.getElementById('pdfTotalGeneral') as HTMLElement).textContent =
      `$${total.toFixed(2)}`;
    (document.getElementById('pdfGuaranteeBox') as HTMLElement).style.display =
      this.status === 'COMPLETED' ? 'block' : 'none';

    (document.getElementById('pdfImages') as HTMLElement).innerHTML = photos
      .map(
        (b64) => `
        <div style="display: inline-block; width: 210px; margin: 8px; page-break-inside: avoid; border: 1px solid #E2E8F0; border-radius: 8px; padding: 5px; background: #ffffff; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <img src="${b64}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 6px;">
        </div>`
      )
      .join('');

    const imgFirma = document.getElementById(
      'pdfSignatureSubImg'
    ) as HTMLImageElement;
    imgFirma.src = signatureDataUrl;
    imgFirma.style.width = '250px';
    imgFirma.style.height = '75px';

    window.scrollTo(0, 0);

    // Mismo truco que el original: sacamos la plantilla de pantalla pero
    // "visible" para que html2canvas pueda pintarla bien.
    pdfWrapper.style.display = 'block';
    pdfWrapper.style.position = 'fixed';
    pdfWrapper.style.top = '0';
    pdfWrapper.style.left = '-9999px';
    pdfWrapper.style.width = '750px';
    pdfWrapper.style.zIndex = '-1';
    pdfWrapper.style.visibility = 'visible';

    // Mismo "delay mágico" del original para que el DOM/imágenes terminen
    // de pintarse antes de capturar con html2canvas.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const safeName = (job.clientName || 'Trabajo').replace(
      /[^a-zA-Z0-9]/g,
      '_'
    );

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `Reporte_${safeName}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['tr', 'h3', 'img', '.avoid-break']
      }
    };

    let pdfBlob: Blob;
    try {
      pdfBlob = await html2pdf().set(opt).from(pdfTemplate).output('blob');
    } finally {
      pdfWrapper.style.display = 'none';
      pdfWrapper.style.visibility = 'hidden';
    }

    return pdfBlob;
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
        status: this.status,
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