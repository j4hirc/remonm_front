import { Cliente } from '../../core/models/cliente.model';
import { ClientesService } from '../../core/services/clientes.service';
import {
    Component,
    DestroyRef,
    ElementRef,
    inject,
    OnDestroy,
    OnInit,
    signal,
    viewChild
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
    FormBuilder,
    ReactiveFormsModule,
    Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import {
    SwalComponent,
    SwalPortalDirective,
    SwalPortalTargets
} from '@sweetalert2/ngx-sweetalert2';
import Swal, { SweetAlertOptions } from 'sweetalert2';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';

import { Job, JobRequest } from '../../core/models/job.model';
import { User } from '../../core/models/user.model';
import { Material } from '../../core/models/material.model';
import { JobsService } from '../../core/services/jobs.service';
import { UsersService } from '../../core/services/users.service';
import { MaterialsService } from '../../core/services/materials.service';
import { InvoicePdfService } from '../../core/services/invoice-pdf.service';

declare const L: any;
declare const html2pdf: any;

interface NecessaryMaterialRow {
    materialId: number;
    name: string;
    quantity: number;
    unit: string;
    price: number;
}

@Component({
    selector: 'app-trabajos',
    standalone: true,
    imports: [
        ReactiveFormsModule,
        SwalComponent,
        SwalPortalDirective,
        RouterLink,
        CurrencyPipe
    ],
    templateUrl: './trabajos.component.html',
    styleUrl: './trabajos.component.css'
})
export class TrabajosComponent implements OnInit, OnDestroy {
    private readonly clientesService = inject(ClientesService);
    readonly clientes = signal<Cliente[]>([]);
    readonly clientesLoading = signal(false);
    readonly clientesError = signal('');

    async loadClientes(): Promise<void> {
        if (this.clientesLoading()) return;
        this.clientesLoading.set(true);
        this.clientesError.set('');
        try {
            this.clientes.set(await firstValueFrom(
                this.clientesService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
            ));
        } catch {
            if (!this.destroyRef.destroyed) {
                this.clientesError.set('No se pudieron cargar los clientes. Puedes reintentar o ingresar sus datos manualmente.');
            }
        } finally { this.clientesLoading.set(false); }
    }

    selectCliente(event: Event): void {
        const select = event.target as HTMLSelectElement;
        const cliente = this.clientes().find(c => c.id === Number(select.value));
        if (!cliente || this.isSaving()) return;
        this.form.patchValue({
            clientName: cliente.clientName,
            clientPhone: cliente.clientPhone ?? '',
            address: cliente.address,
            latitude: cliente.latitude,
            longitude: cliente.longitude
        });
        this.form.markAsDirty();
        if (Number.isFinite(cliente.latitude) && Number.isFinite(cliente.longitude)) {
            this.marker?.setLatLng([cliente.latitude, cliente.longitude]);
            this.map?.setView([cliente.latitude, cliente.longitude], 16);
        }
        // Solo copia los datos; el backend no vincula el trabajo a un clienteId.
        select.value = '';
    }

    private readonly jobsService = inject(JobsService);
    private readonly usersService = inject(UsersService);
    private readonly materialsService = inject(MaterialsService);
    private readonly formBuilder = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);

    private readonly editor = viewChild.required<SwalComponent>('editor');
    private readonly invoicePdf = inject(InvoicePdfService);

    readonly swalTargets = inject(SwalPortalTargets);

    readonly jobs = signal<readonly Job[]>([]);
    readonly employees = signal<readonly User[]>([]);
    readonly managers = signal<readonly User[]>([]);
    readonly materials = signal<readonly Material[]>([]);
    readonly colorByEmployeeId = signal<Record<number, string>>({});

    readonly isLoading = signal(false);
    readonly isSaving = signal(false);
    readonly editorOpen = signal(false);
    readonly deletingId = signal<number | null>(null);
    readonly loadError = signal(false);
    readonly editingId = signal<number | null>(null);

    // Filtros
    readonly searchText = signal('');
    readonly statusFilter = signal('ALL');
    readonly priorityFilter = signal('');
    readonly dateFrom = signal('');
    readonly dateTo = signal('');
    readonly employeeFilter = signal('');

    // Materiales dentro del modal
    readonly materialSearch = signal('');
    readonly materialCategoryFilter = signal('');
    readonly necessaryMaterials = signal<NecessaryMaterialRow[]>([]);
    readonly selectedMaterialIds = signal<Set<number>>(new Set());
    readonly blueprintFiles = signal<File[]>([]);
    readonly existingBlueprintUrls = signal<string[]>([]);

    private map: any = null;
    private marker: any = null;

    readonly form = this.formBuilder.nonNullable.group({
        clientName: ['', Validators.required],
        clientPhone: ['', Validators.required],
        address: ['', Validators.required],
        buildingNumber: [''],
        apartment: [''],
        latitude: [0, Validators.required],
        longitude: [0, Validators.required],
        employeeId: ['', Validators.required],
        managerId: ['', Validators.required],
        description: [''],
        priority: [2, Validators.required],
        jobDate: ['', Validators.required],
        pay: [0, [Validators.required, Validators.min(0)]],
        safeDepositBoxCodes: [''],
        quickbooksInvoice: [''],
        status: ['PENDING', Validators.required]
    });

    readonly editorOptions: SweetAlertOptions = {
        width: 780,
        showCancelButton: true,
        showCloseButton: true,
        confirmButtonText: 'Guardar Trabajo',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#e65100',
        cancelButtonColor: '#2E3238',
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !this.isSaving(),
        allowEscapeKey: () => !this.isSaving(),
        preConfirm: () => this.persistJob()
    };

    constructor() {
        // AÑADIDO: Libera la pantalla si cambias de pestaña o destruyes el componente
        this.destroyRef.onDestroy(() => {
            if (Swal.isVisible()) Swal.close();
        });
    }

    /** Bindear en el template: <swal #editor (didOpen)="onEditorDidOpen()"> */
    onEditorDidOpen(): void {
        void this.loadClientes();
        this.initMapFromForm();
    }

    /** Bindear en el template: <swal #editor (willClose)="onEditorWillClose()"> */
    onEditorWillClose(): void {
        this.destroyMap();
    }

    ngOnInit(): void {
        void this.bootstrap();
    }

    ngOnDestroy(): void {
        this.destroyMap();
    }

    private async bootstrap(): Promise<void> {
        this.isLoading.set(true);

        // MODAL DE CARGA AÑADIDO
        void Swal.fire({
            title: 'Cargando datos del sistema...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            await Promise.all([this.loadUsers(), this.loadMaterials()]);
            await this.loadJobs();

            // Si loadJobs falló y mostró la alerta de error, no la cerramos
            if (this.loadError()) {
                return;
            }

            // Si todo cargó bien, cerramos el modal
            if (Swal.isVisible()) {
                Swal.close();
            }
        } finally {
            this.isLoading.set(false);
        }
    }

    async loadJobs(): Promise<void> {
        this.loadError.set(false);
        try {
            const jobs = await firstValueFrom(
                this.jobsService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
            );
            this.jobs.set(jobs);
        } catch (error: unknown) {
            this.loadError.set(true);
            
            // Esto sobrescribirá automáticamente el modal de "Cargando datos..."
            await Swal.fire({
                icon: 'error',
                title: 'No se pudieron cargar los trabajos',
                text: this.getErrorMessage(error),
                confirmButtonColor: '#12CFF4'
            });
        }
    }

    private async loadUsers(): Promise<void> {
        try {
            const users = await firstValueFrom(
                this.usersService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
            );

            const colors: Record<number, string> = {};
            users.forEach((u) => {
                colors[u.userId] = u.color || '#CCCCCC';
            });
            this.colorByEmployeeId.set(colors);

            const active = users.filter((u) => u.status !== 'Unemployed');
            this.employees.set(
                active.filter((u) =>
                    u.roles?.some((r) => r.name === 'ROLE_EMPLOYEE')
                )
            );
            this.managers.set(
                active.filter((u) =>
                    u.roles?.some(
                        (r) => r.name === 'ROLE_JEFE' || r.name === 'ROLE_ADMIN'
                    )
                )
            );
        } catch {
            /* ignore */
        }
    }

    private async loadMaterials(): Promise<void> {
        try {
            const mats = await firstValueFrom(
                this.materialsService
                    .getAll()
                    .pipe(takeUntilDestroyed(this.destroyRef))
            );
            this.materials.set(mats);
        } catch {
            /* ignore */
        }
    }

    // ---------- FILTROS LISTA ----------

    readonly filteredJobs = () => {
        const text = this.searchText().trim().toLowerCase();
        const status = this.statusFilter();
        const priority = this.priorityFilter().trim();
        const from = this.dateFrom();
        const to = this.dateTo();
        const emp = this.employeeFilter().trim().toLowerCase();

        let list = [...this.jobs()].filter((job) => {
            const coincideTexto =
                (job.clientName || '').toLowerCase().includes(text) ||
                (job.description || '').toLowerCase().includes(text) ||
                (job.nameEmployee || '').toLowerCase().includes(text) ||
                (job.nameManager || '').toLowerCase().includes(text);

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

            let coincideFecha = true;
            const jobDateStr = this.fechaParaInput(job.jobDate);
            if (from && jobDateStr) coincideFecha = coincideFecha && jobDateStr >= from;
            if (to && jobDateStr) coincideFecha = coincideFecha && jobDateStr <= to;

            const coincideEmp =
                !emp ||
                (job.nameEmployee || '').toLowerCase().includes(emp);

            return (
                coincideTexto &&
                coincideEstado &&
                coincidePrioridad &&
                coincideFecha &&
                coincideEmp
            );
        });

        // Más nuevo arriba
        list.sort((a, b) => {
            const timeB = this.jobTime(b.jobDate);
            const timeA = this.jobTime(a.jobDate);
            if (timeB !== timeA) return timeB - timeA;
            return b.jobId - a.jobId;
        });

        return list;
    };

    onSearch(e: Event): void {
        this.searchText.set((e.target as HTMLInputElement).value);
    }
    onStatus(e: Event): void {
        this.statusFilter.set((e.target as HTMLSelectElement).value);
    }
    onPriority(e: Event): void {
        this.priorityFilter.set((e.target as HTMLInputElement).value);
    }
    onDateFrom(e: Event): void {
        this.dateFrom.set((e.target as HTMLInputElement).value);
    }
    onDateTo(e: Event): void {
        this.dateTo.set((e.target as HTMLInputElement).value);
    }
    onEmployeeFilter(e: Event): void {
        this.employeeFilter.set((e.target as HTMLSelectElement).value);
    }

    clearFilters(): void {
        this.searchText.set('');
        this.statusFilter.set('ALL');
        this.priorityFilter.set('');
        this.dateFrom.set('');
        this.dateTo.set('');
        this.employeeFilter.set('');
    }

    // ---------- MATERIALES EN MODAL ----------

    readonly materialCategories = () => {
        const set = new Set<string>();
        this.materials().forEach((m) => {
            if (m.categoryName) set.add(m.categoryName);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    };

    readonly filteredMaterialsForModal = () => {
        const text = this.materialSearch().trim().toLowerCase();
        const cat = this.materialCategoryFilter();
        return this.materials().filter((m) => {
            const okText = (m.name || '').toLowerCase().includes(text);
            const okCat = !cat || m.categoryName === cat;
            return okText && okCat;
        });
    };

    toggleMaterial(mat: Material, checked: boolean): void {
        const set = new Set(this.selectedMaterialIds());
        if (checked) {
            set.add(mat.materialId);
            this.addNecessary(mat, 1);
        } else {
            set.delete(mat.materialId);
            this.removeNecessary(mat.materialId);
        }
        this.selectedMaterialIds.set(set);
    }

    private addNecessary(mat: Material, qty: number): void {
        if (this.necessaryMaterials().some((x) => x.materialId === mat.materialId)) {
            return;
        }
        this.necessaryMaterials.update((rows) => [
            ...rows,
            {
                materialId: mat.materialId,
                name: mat.name,
                quantity: qty,
                unit: mat.unit || '',
                price: mat.price || 0
            }
        ]);
        this.recalcPay();
    }

    removeNecessary(materialId: number): void {
        this.necessaryMaterials.update((rows) =>
            rows.filter((r) => r.materialId !== materialId)
        );
        const set = new Set(this.selectedMaterialIds());
        set.delete(materialId);
        this.selectedMaterialIds.set(set);
        this.recalcPay();
    }

    updateNecessaryQty(materialId: number, qty: number): void {
        this.necessaryMaterials.update((rows) =>
            rows.map((r) =>
                r.materialId === materialId ? { ...r, quantity: qty } : r
            )
        );
        this.recalcPay();
    }

    necessaryTotal(): number {
        return this.necessaryMaterials().reduce(
            (sum, r) => sum + r.quantity * r.price,
            0
        );
    }

    private recalcPay(): void {
        this.form.controls.pay.setValue(
            Number(this.necessaryTotal().toFixed(2))
        );
    }

    // ---------- EDITOR ----------

    async openCreate(): Promise<void> {
        if (this.isLoading() || this.editorOpen()) return;
        this.editingId.set(null);
        this.necessaryMaterials.set([]);
        this.selectedMaterialIds.set(new Set());
        this.blueprintFiles.set([]);
        this.existingBlueprintUrls.set([]);
        this.materialSearch.set('');
        this.materialCategoryFilter.set('');

        this.form.reset({
            clientName: '',
            clientPhone: '',
            address: '',
            buildingNumber: '',
            apartment: '',
            latitude: -2.900128,
            longitude: -79.005896,
            employeeId: '',
            managerId: '',
            description: '',
            priority: 2,
            jobDate: '',
            pay: 0,
            safeDepositBoxCodes: '',
            quickbooksInvoice: '',
            status: 'PENDING'
        });

        this.editorOpen.set(true);
        try {
            const result = await this.editor().fire();
            if (result.isConfirmed && !this.destroyRef.destroyed) {
                await Swal.fire({
                    icon: 'success',
                    title: '¡Éxito!',
                    text: 'Trabajo asignado correctamente.',
                    confirmButtonColor: '#12CFF4'
                });
            }
        } finally {
            this.editorOpen.set(false);
            this.destroyMap();
        }
    }

    async openEdit(jobId: number): Promise<void> {
        if (this.isLoading() || this.editorOpen()) return;

        Swal.fire({
            title: 'Cargando datos...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const data = await firstValueFrom(
                this.jobsService.getById(jobId).pipe(takeUntilDestroyed(this.destroyRef))
            );

            await Swal.close();

            this.editingId.set(jobId);
            this.necessaryMaterials.set([]);
            this.selectedMaterialIds.set(new Set());
            this.blueprintFiles.set([]);
            this.existingBlueprintUrls.set(data.blueprintUrls || []);

            let descripcion = data.description || '';
            if (descripcion.includes('[MATERIALES PRE-ASIGNADOS]:')) {
                descripcion = descripcion
                    .split('[MATERIALES PRE-ASIGNADOS]:')[0]
                    .trim();
            }

            this.form.reset({
                clientName: data.clientName || '',
                clientPhone: data.clientPhone || '',
                address: data.address || '',
                buildingNumber: data.buildingNumber ?? '',
                apartment: data.apartment ?? '',
                latitude: data.latitude,
                longitude: data.longitude,
                employeeId: String(data.employeeId || ''),
                managerId: String(data.managerId || ''),
                description: descripcion,
                priority: data.priority ?? 2,
                jobDate: this.fechaParaInput(data.jobDate),
                pay: data.pay || 0,
                safeDepositBoxCodes: data.safeDepositBoxCodes || '',
                quickbooksInvoice: data.quickbooksInvoice || '',
                status: data.status || 'PENDING'
            });

            // Materiales asignados
            const mats = data.materials || [];
            const set = new Set<number>();
            mats.forEach((m: any) => {
                const id = m.materialId;
                set.add(id);
                const info = this.materials().find((x) => x.materialId === id);
                this.addNecessary(
                    info || {
                        materialId: id,
                        name: m.name || 'Material',
                        count: 0,
                        price: m.price || 0,
                        categoryName: '',
                        unit: m.unit || ''
                    },
                    m.quantity || 1
                );
            });
            this.selectedMaterialIds.set(set);

            this.editorOpen.set(true);
            const result = await this.editor().fire();
            
            if (result.isConfirmed && !this.destroyRef.destroyed) {
                await Swal.fire({
                    icon: 'success',
                    title: '¡Éxito!',
                    text: 'Trabajo actualizado.',
                    confirmButtonColor: '#12CFF4'
                });
            } else if (result.isDenied && !this.destroyRef.destroyed) {
                // Si presiona el botón "Eliminar", buscamos el trabajo y lanzamos la alerta de borrado
                const jobToDel = this.jobs().find(j => j.jobId === jobId);
                if (jobToDel) {
                    await this.deleteJob(jobToDel);
                }
            }
        } catch (error: unknown) {
            Swal.close();
            await Swal.fire({
                icon: 'error',
                title: 'Error',
                text: this.getErrorMessage(error),
                confirmButtonColor: '#12CFF4'
            });
        } finally {
            this.editorOpen.set(false);
            this.destroyMap();
        }
    }

    submitEditor(): void {
        if (!this.isSaving()) Swal.clickConfirm();
    }

    onBlueprintChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = input.files ? Array.from(input.files) : [];
        const current = [...this.blueprintFiles()];
        for (const f of files) {
            if (!current.some((x) => x.name === f.name && x.size === f.size)) {
                current.push(f);
            }
        }
        this.blueprintFiles.set(current);
        input.value = '';
    }

    removeBlueprintFile(index: number): void {
        this.blueprintFiles.update((arr) => arr.filter((_, i) => i !== index));
    }

    private async persistJob(): Promise<Job | false> {
        if (this.isSaving()) return false;
        this.form.markAllAsTouched();
        if (this.form.invalid) {
            Swal.showValidationMessage(
                'Completa Cliente, Teléfono, Dirección, Empleado, Manager, Fecha y Ubicación.'
            );
            return false;
        }

        this.isSaving.set(true);
        const raw = this.form.getRawValue();

        let descripcionBase = raw.description.trim();
        if (descripcionBase.includes('[MATERIALES PRE-ASIGNADOS]:')) {
            descripcionBase = descripcionBase
                .split('[MATERIALES PRE-ASIGNADOS]:')[0]
                .trim();
        }
        let resumen = '';
        this.necessaryMaterials().forEach((r) => {
            resumen += `• ${r.name}: ${r.quantity} ${r.unit || ''}\n`;
        });
        const description =
            resumen !== ''
                ? `${descripcionBase}\n\n[MATERIALES PRE-ASIGNADOS]:\n${resumen}`
                : descripcionBase;

        const materials = this.necessaryMaterials().map((r) => ({
            materialId: r.materialId,
            quantity: r.quantity,
            unit: r.unit || 'N/A'
        }));

        const necessaryMaterials = this.necessaryMaterials().map((r) => ({
            materialId: r.materialId,
            name: r.name,
            quantity: r.quantity,
            unit: r.unit,
            estimatedPrice: r.price
        }));

        const request: JobRequest = {
            clientName: raw.clientName.trim(),
            clientPhone: raw.clientPhone.trim(),
            description,
            address: raw.address.trim(),
            buildingNumber: raw.buildingNumber.trim() || null,
            apartment: raw.apartment.trim() || null,
            latitude: Number(raw.latitude),
            longitude: Number(raw.longitude),
            safeDepositBoxCodes: raw.safeDepositBoxCodes.trim() || null,
            quickbooksInvoice: raw.quickbooksInvoice.trim() || null,
            status: raw.status,
            pay: Number(raw.pay),
            jobDate: raw.jobDate,
            employeeId: Number(raw.employeeId),
            managerId: Number(raw.managerId),
            materials,
            necessaryMaterials,
            priority: Number(raw.priority)
        };

        const id = this.editingId();
        const files = this.blueprintFiles();

        try {
            const saved =
                id === null
                    ? await firstValueFrom(
                        this.jobsService
                            .create(request, files)
                            .pipe(takeUntilDestroyed(this.destroyRef))
                    )
                    : await firstValueFrom(
                        this.jobsService
                            .update(id, request, files)
                            .pipe(takeUntilDestroyed(this.destroyRef))
                    );

            await this.loadJobs();
            return saved;
        } catch (error: unknown) {
            if (!this.destroyRef.destroyed) {
                Swal.showValidationMessage(this.getErrorMessage(error));
            }
            return false;
        } finally {
            this.isSaving.set(false);
        }
    }

    async deleteJob(job: Job): Promise<void> {
        if (this.deletingId() !== null || this.editorOpen()) return;
        this.deletingId.set(job.jobId);
        try {
            const result = await Swal.fire({
                title: '¿Eliminar Trabajo?',
                text: 'Se borrará del sistema permanentemente.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#d33',
                cancelButtonColor: '#2E3238',
                showLoaderOnConfirm: true,
                preConfirm: async () => {
                    try {
                        await firstValueFrom(
                            this.jobsService
                                .delete(job.jobId)
                                .pipe(takeUntilDestroyed(this.destroyRef))
                        );
                        this.jobs.update((list) =>
                            list.filter((j) => j.jobId !== job.jobId)
                        );
                        return true;
                    } catch (error: unknown) {
                        Swal.showValidationMessage(this.getErrorMessage(error, true));
                        return false;
                    }
                }
            });
            if (result.isConfirmed) {
                await Swal.fire({
                    icon: 'success',
                    title: '¡Eliminado!',
                    text: 'El trabajo fue eliminado.',
                    confirmButtonColor: '#12CFF4'
                });
            }
        } finally {
            this.deletingId.set(null);
        }
    }

    // ---------- MAPA ----------

    private initMapFromForm(): void {
        this.waitForElement('.swal2-container #jobMap', 30, 50).then((host) => {
            if (!host) {
                console.warn('No se encontró el contenedor del mapa en el modal (timeout).');
                return;
            }
            this.buildMap(host);
        });
    }

    private waitForElement(
        selector: string,
        maxTries = 30,
        intervalMs = 50
    ): Promise<HTMLElement | null> {
        return new Promise((resolve) => {
            let tries = 0;

            const tick = () => {
                const el = document.querySelector(selector) as HTMLElement | null;
                if (el) {
                    resolve(el);
                    return;
                }
                tries++;
                if (tries >= maxTries) {
                    resolve(null);
                    return;
                }
                requestAnimationFrame(() => setTimeout(tick, intervalMs));
            };

            tick();
        });
    }

    private buildMap(host: HTMLElement): void {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        if ((host as any)._leaflet_id) {
            (host as any)._leaflet_id = null;
        }
        host.innerHTML = '';

        const lat = this.form.controls.latitude.value ?? -2.900128;
        const lng = this.form.controls.longitude.value ?? -79.005896;

        this.map = L.map(host, { scrollWheelZoom: true }).setView([lat, lng], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(this.map);

        this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);

        this.marker.on('dragend', () => {
            const pos = this.marker.getLatLng();
            this.form.controls.latitude.setValue(Number(pos.lat.toFixed(6)));
            this.form.controls.longitude.setValue(Number(pos.lng.toFixed(6)));
            this.reverseGeocode(pos.lat, pos.lng);
        });

        this.map.on('click', (e: any) => {
            this.marker.setLatLng(e.latlng);
            this.form.controls.latitude.setValue(Number(e.latlng.lat.toFixed(6)));
            this.form.controls.longitude.setValue(Number(e.latlng.lng.toFixed(6)));
            this.reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        requestAnimationFrame(() => {
            setTimeout(() => {
                this.map?.invalidateSize(true);
            }, 150);
        });

        this.resetScrollInsideModal();
    }

    private resetScrollInsideModal(): void {
        const resetTodo = () => {
            const container = document.querySelector('.swal2-container') as HTMLElement | null;
            const popup = document.querySelector('.swal2-popup') as HTMLElement | null;
            if (container) container.scrollTop = 0;
            if (popup) {
                popup.scrollTop = 0;
                popup.querySelectorAll('*').forEach((el) => {
                    const node = el as HTMLElement;
                    if (node.scrollHeight > node.clientHeight) {
                        node.scrollTop = 0;
                    }
                });
            }
        };

        requestAnimationFrame(resetTodo);
        setTimeout(resetTodo, 50);
        setTimeout(resetTodo, 300);
    }

    private destroyMap(): void {
        if (this.map) {
            this.map.remove();
            this.map = null;
            this.marker = null;
        }
        const host = document.getElementById('jobMap');
        if (host) {
            if ((host as any)._leaflet_id) {
                (host as any)._leaflet_id = null;
            }
            host.innerHTML = '';
        }
    }

    private reverseGeocode(lat: number, lng: number): void {
        fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=es&addressdetails=1`
        )
            .then((r) => r.json())
            .then((data) => {
                if (!data?.address) return;
                const a = data.address;
                const calle = [a.house_number || '', a.road || a.pedestrian || '']
                    .filter(Boolean)
                    .join(' ');
                const partes = [
                    calle,
                    a.city || a.town || a.village || a.municipality || '',
                    a.state || ''
                ].filter(Boolean);
                this.form.controls.address.setValue(partes.join(', '));
            })
            .catch(() => undefined);
    }

    searchAddressOnMap(): void {
        const texto = this.form.controls.address.value.trim();
        if (!texto) return;

        const regexCoords = /^[-+]?\d+(\.\d+)?,\s*[-+]?\d+(\.\d+)?$/;
        if (regexCoords.test(texto)) {
            const partes = texto.split(',');
            const latV = parseFloat(partes[0]);
            const lngV = parseFloat(partes[1]);
            if (!isNaN(latV) && !isNaN(lngV)) {
                this.form.controls.latitude.setValue(Number(latV.toFixed(6)));
                this.form.controls.longitude.setValue(Number(lngV.toFixed(6)));
                if (this.map && this.marker) {
                    this.marker.setLatLng([latV, lngV]);
                    this.map.setView([latV, lngV], 16);
                }
            }
            return;
        }

        fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(texto)}&accept-language=es&limit=1`
        )
            .then((res) => res.json())
            .then((results) => {
                if (results && results.length > 0) {
                    const latV = parseFloat(results[0].lat);
                    const lngV = parseFloat(results[0].lon);
                    this.form.controls.latitude.setValue(Number(latV.toFixed(6)));
                    this.form.controls.longitude.setValue(Number(lngV.toFixed(6)));
                    if (this.map && this.marker) {
                        this.marker.setLatLng([latV, lngV]);
                        this.map.setView([latV, lngV], 16);
                    }
                } else {
                    void Swal.fire({
                        icon: 'warning',
                        title: 'No encontrado',
                        text: 'No se encontró esa dirección. Intenta ser más específico o usa el mapa.',
                        confirmButtonColor: '#12CFF4',
                        timer: 3000,
                        timerProgressBar: true
                    });
                }
            })
            .catch((err) => console.error('Error geocoding:', err));
    }

    onAddressKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.searchAddressOnMap();
        }
    }

    myLocation(): void {
        if (!navigator.geolocation) {
            void Swal.fire('No soportado', 'Tu navegador no soporta geolocalización.', 'warning');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                this.form.controls.latitude.setValue(Number(lat.toFixed(6)));
                this.form.controls.longitude.setValue(Number(lng.toFixed(6)));
                if (this.map && this.marker) {
                    this.map.setView([lat, lng], 16);
                    this.marker.setLatLng([lat, lng]);
                    this.map.invalidateSize(true);
                }
                this.reverseGeocode(lat, lng);
            },
            () => {
                void Swal.fire('Error', 'No se pudo obtener tu ubicación.', 'error');
            },
            { enableHighAccuracy: true }
        );
    }

    cleanDescription(desc?: string | null): string {
        if (!desc) return 'Sin descripción';
        if (desc.includes('[MATERIALES PRE-ASIGNADOS]:')) {
            return desc.split('[MATERIALES PRE-ASIGNADOS]:')[0].trim() || 'Sin descripción';
        }
        return desc;
    }

    statusBadge(status: string): { label: string; className: string } {
        switch (status) {
            case 'PENDING':
                return { label: 'Pendiente', className: 'badge badge-pending' };
            case 'IN_PROGRESS':
                return { label: 'En Progreso', className: 'badge badge-progress' };
            case 'COMPLETED':
                return { label: 'Completado', className: 'badge badge-done' };
            default:
                return { label: 'Cancelado', className: 'badge badge-cancel' };
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
        const parts = String(fecha).split('-');
        if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
        return String(fecha);
    }

    fechaParaInput(fecha: string | number[] | null | undefined): string {
        if (!fecha) return '';
        if (Array.isArray(fecha)) {
            const [y, m, d] = fecha;
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        return String(fecha).slice(0, 10);
    }

    private jobTime(fecha: string | number[] | null | undefined): number {
        if (!fecha) return 0;
        if (Array.isArray(fecha)) {
            return new Date(fecha[0], fecha[1] - 1, fecha[2]).getTime();
        }
        return new Date(fecha).getTime();
    }

    viewBlueprints(job: Job): void {
        const urls = job.blueprintUrls || [];
        if (!urls.length) {
            void Swal.fire('Sin planos', 'Este proyecto no tiene planos adjuntos.', 'info');
            return;
        }
        const html = urls
            .map(
                (url, i) =>
                    `<a href="${url}" target="_blank" style="display:block;margin:8px 0;color:#0f4c81;font-weight:600;">
            <i class="fa-solid fa-file-pdf"></i> Documento ${i + 1}
          </a>`
            )
            .join('');
        void Swal.fire({
            title: 'Planos del Proyecto',
            html,
            confirmButtonColor: '#0f4c81'
        });
    }

    async generatePdf(job: Job): Promise<void> {
        if (!this.invoicePdf.canGenerate(job)) {
            await Swal.fire({
                icon: 'warning',
                title: 'No disponible',
                text: 'Solo se puede generar la factura si el trabajo está Completado y tiene número de QuickBooks.',
                confirmButtonColor: '#0f4c81'
            });
            return;
        }

        await Swal.fire({
            title: 'Generando PDF...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            await this.invoicePdf.download(job);
            await Swal.fire({
                icon: 'success',
                title: 'PDF generado',
                text: 'El documento se descargó correctamente.',
                confirmButtonColor: '#0f4c81',
                timer: 2000
            });
        } catch {
            await Swal.fire('Error', 'No se pudo generar el PDF.', 'error');
        }
    }

    fullUserName(u: User): string {
        return u.name || `${u.firstName} ${u.lastName}`.trim();
    }

    private getErrorMessage(error: unknown, deleting = false): string {
        if (error instanceof HttpErrorResponse) {
            if (error.status === 0) return 'No se pudo conectar con el servidor.';
            if (error.status === 401) return 'Sesión inválida o expirada.';
            if (error.status === 403) return 'No tienes permisos.';
            let body: unknown = error.error;
            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                } catch {
                    body = null;
                }
            }
            if (
                typeof body === 'object' &&
                body !== null &&
                'message' in body
            ) {
                const msg = (body as { message: unknown }).message;
                if (typeof msg === 'string') return msg;
                if (typeof msg === 'object' && msg !== null) {
                    return Object.values(msg as Record<string, string>).join(' ');
                }
            }
        }
        return deleting
            ? 'No se pudo eliminar el trabajo.'
            : 'No se pudo completar la operación.';
    }
}