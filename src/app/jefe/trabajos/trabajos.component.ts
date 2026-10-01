import { Cliente } from '../../core/models/cliente.model';
import { ClientesService } from '../../core/services/clientes.service';
import {
    Component,
    DestroyRef,
    inject,
    OnDestroy,
    OnInit,
    signal,
    computed,
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
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { CurrencyPipe } from '@angular/common';

import { Job, JobRequest } from '../../core/models/job.model';
import { User } from '../../core/models/user.model';
import { Material } from '../../core/models/material.model';
import { JobsService } from '../../core/services/jobs.service';
import { UsersService } from '../../core/services/users.service';
import { MaterialsService } from '../../core/services/materials.service';
import { InvoicePdfService } from '../../core/services/invoice-pdf.service';

declare const L: any;

interface NecessaryMaterialRow {
    materialId: number;
    name: string;
    quantity: number;
    unit: string;
    price: number;
}

@Component({
    selector: 'app-jefe-trabajos',
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
export class TrabajosJefeComponent implements OnInit, OnDestroy {
    private readonly clientesService = inject(ClientesService);
    readonly clientes = signal<Cliente[]>([]);
    readonly clientesLoading = signal(false);
    readonly clientesError = signal('');
    readonly managerFijoId = 5;

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

    seleccionarClienteManual(cliente: Cliente): void {
        if (this.isSaving()) return;

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

        this.clientSearchModal.set('');
        this.showClientList.set(false);
    }

    hideClientList(): void {
        setTimeout(() => {
            this.showClientList.set(false);
        }, 200);
    }

    private readonly jobsService = inject(JobsService);
    private readonly usersService = inject(UsersService);
    private readonly materialsService = inject(MaterialsService);
    private readonly formBuilder = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);

    private readonly editor = viewChild.required<SwalComponent>('editor');
    private readonly invoicePdf = inject(InvoicePdfService);

    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);

    readonly swalTargets = inject(SwalPortalTargets);

    readonly jobs = signal<readonly Job[]>([]);
    readonly employees = signal<readonly User[]>([]);
    readonly managers = signal<readonly User[]>([]);
    // Todos los usuarios (para poder mostrar un manager guardado aunque esté inactivo)
    private readonly allUsers = signal<readonly User[]>([]);
    readonly materials = signal<readonly Material[]>([]);
    readonly colorByEmployeeId = signal<Record<number, string>>({});

    readonly isLoading = signal(false);
    readonly isSaving = signal(false);
    readonly editorOpen = signal(false);
    readonly deletingId = signal<number | null>(null);
    readonly loadError = signal(false);
    readonly editingId = signal<number | null>(null);
    readonly isDuplicating = signal(false);

    // Filtros de la tabla principal
    readonly searchText = signal('');
    readonly statusFilter = signal('ALL');
    readonly priorityFilter = signal('');
    readonly dateFrom = signal('');
    readonly dateTo = signal('');
    readonly employeeFilter = signal('');

    // Búsqueda de clientes en el modal
    readonly clientSearchModal = signal('');
    readonly showClientList = signal(false);
    readonly filteredClientesModal = computed(() => {
        const term = this.clientSearchModal().trim().toLowerCase();
        if (!term) return this.clientes();
        return this.clientes().filter(c =>
            c.clientName.toLowerCase().includes(term) ||
            (c.clientPhone || '').toLowerCase().includes(term) ||
            c.address.toLowerCase().includes(term)
        );
    });

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
        clientPhone: [''],
        address: ['', Validators.required],
        buildingNumber: [''],
        apartment: [''],
        latitude: [0, Validators.required],
        longitude: [0, Validators.required],
        employeeId: ['', Validators.required],
        managerId: [String(this.managerFijoId), Validators.required],
        description: [''],
        priority: [2, Validators.required],
        jobDate: ['', Validators.required],
        pay: [0, [Validators.required, Validators.min(0)]],
        safeDepositBoxCodes: [''],
        quickbooksInvoice: [''],
        status: ['PENDING', Validators.required]
    });

    editorOptions: SweetAlertOptions = {
        width: 780,
        showCancelButton: true,
        showCloseButton: false,
        showDenyButton: true,

        confirmButtonText: 'Guardar cambios',
        denyButtonText: 'Guardar y enviar correo',
        cancelButtonText: 'Cancelar',

        confirmButtonColor: '#e65100',
        denyButtonColor: '#1565c0',
        cancelButtonColor: '#2E3238',

        allowOutsideClick: false,
        allowEscapeKey: false,

        preConfirm: () => this.validateEditor(),
        preDeny: () => this.validateEditor()
    };

    private validateEditor(): boolean {
        if (this.isSaving()) {
            return false;
        }

        this.form.markAllAsTouched();

        if (this.form.invalid) {
            Swal.showValidationMessage(
                'Completa Cliente, Dirección, Empleado, Manager, Fecha y Ubicación.'
            );
            return false;
        }

        if (this.isDuplicating()) {
            const v = this.form.getRawValue();

            const conflicto = this.duplicateConflict(
                v.clientName,
                v.address,
                v.jobDate,
                v.buildingNumber,
                v.apartment
            );

            if (conflicto) {
                Swal.showValidationMessage(conflicto);
                return false;
            }
        }

        return true;
    }

    onEditorDidOpen(): void {
        void this.loadClientes();
        this.initMapFromForm();
        this.injectDeleteButtonInSwal();
    }

    onEditorWillClose(): void {
        this.destroyMap();
        this.removeDeleteButtonFromSwal();
    }

    ngOnInit(): void {
        void this.bootstrap();
    }

    ngOnDestroy(): void {
        this.destroyMap();
        Swal.close();
    }

    private async volverAlCalendario(): Promise<void> {
        if (
            this.destroyRef.destroyed
            || this.route.snapshot.queryParamMap.get('origen') !== 'calendario'
        ) {
            return;
        }

        await this.router.navigate(['calendario'], {
            relativeTo: this.route.parent,
            replaceUrl: true
        });
    }

    private async bootstrap(): Promise<void> {
        this.isLoading.set(true);

        void Swal.fire({
            title: 'Cargando trabajos...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            await Promise.all([
                this.loadUsers(),
                this.loadMaterials()
            ]);

            await this.loadJobs();

            if (this.destroyRef.destroyed || this.loadError()) {
                return;
            }

            if (Swal.isVisible()) {
                Swal.close();
            }
        } finally {
            this.isLoading.set(false);
        }

        if (this.destroyRef.destroyed) {
            return;
        }

        const nuevo = this.route.snapshot.queryParamMap.get('nuevo');

        if (nuevo === '1') {
            await this.router.navigate([], {
                relativeTo: this.route,
                queryParams: {
                    nuevo: null
                },
                queryParamsHandling: 'merge',
                replaceUrl: true
            });

            if (this.destroyRef.destroyed) {
                return;
            }

            // Abrir el formulario vacío para crear un trabajo.
            void this.openCreate();
            return;
        }

        // Mantener la apertura de trabajos existentes.
        const abrir = this.route.snapshot.queryParamMap.get('abrir');

        if (abrir) {
            const id = parseInt(abrir, 10);

            if (!Number.isNaN(id)) {
                void this.openEdit(id);
            }
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
            this.allUsers.set(users);

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
                    u.roles?.some((r) =>
                        ['ROLE_JEFE', 'ROLE_ADMIN', 'ROLE_MANAGER'].includes(r.name)
                    )
                )
            );
        } catch (error) {
            console.error('Error cargando usuarios:', error);
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

    // Manager por defecto que SÍ exista en la lista del select
    private defaultManagerId(): string {
        const list = this.managers();
        if (list.some((m) => m.userId === this.managerFijoId)) {
            return String(this.managerFijoId);
        }
        return list.length ? String(list[0].userId) : '';
    }

    // Garantiza que el manager guardado aparezca en el select (aunque esté inactivo)
    private ensureManagerInList(managerId: number): void {
        if (this.managers().some((m) => m.userId === managerId)) return;
        const found = this.allUsers().find((u) => u.userId === managerId);
        if (found) {
            this.managers.update((list) => [...list, found]);
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
                (job.nameManager || '').toLowerCase().includes(text) ||
                (job.quickbooksInvoice || '').toLowerCase().includes(text);

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

        // Ordenado por fecha del trabajo: del más reciente al más antiguo.
        // Si dos trabajos tienen la misma fecha, desempata por nombre de cliente.
        list.sort((a, b) => {
            const diff = this.jobTime(b.jobDate) - this.jobTime(a.jobDate);
            if (diff !== 0) return diff;
            return (a.clientName || '').localeCompare(b.clientName || '', 'es');
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
        const cantidadSegura = Number.isFinite(qty) && qty >= 0 ? qty : 0;
        this.necessaryMaterials.update((rows) =>
            rows.map((r) =>
                r.materialId === materialId ? { ...r, quantity: cantidadSegura } : r
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
    this.isDuplicating.set(false);
    this.clientSearchModal.set('');
    this.showClientList.set(false);
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
        managerId: this.defaultManagerId(),
        description: '',
        priority: 2,
        jobDate: '',
        pay: 0,
        safeDepositBoxCodes: '',
        quickbooksInvoice: '',
        status: 'PENDING'
    });

    const editorCmp = this.editor();

    editorCmp.swalOptions = {
        ...this.editorOptions,
        confirmButtonText: 'Guardar trabajo',
        showDenyButton: true,
        denyButtonText: 'Guardar y enviar correo',
        denyButtonColor: '#1565c0'
    };

    this.editorOptions = editorCmp.swalOptions;

    this.editorOpen.set(true);

    const result = await editorCmp.fire();

    this.editorOpen.set(false);
    this.destroyMap();

    if (result.isDismissed) {
        await this.volverAlCalendario();
        return;
    }

    if (
        (result.isConfirmed || result.isDenied)
        && !this.destroyRef.destroyed
    ) {
        void Swal.fire({
            title: 'Guardando trabajo...',
            text: 'Por favor, espera.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            await this.persistJob(result.isDenied);

            await Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: 'Trabajo asignado correctamente.',
                confirmButtonColor: '#12CFF4'
            });

            await this.volverAlCalendario();
        } catch (error: unknown) {
            await Swal.fire(
                'Error',
                this.getErrorMessage(error),
                'error'
            );
        }
    }
}

    /** Duplicar = abrir el editor con todo precargado, pero guardando como trabajo nuevo. */
    openDuplicate(jobId: number): Promise<void> {
        return this.openEdit(jobId, true);
    }

    async openEdit(jobId: number, duplicate = false): Promise<void> {
    if (this.isLoading() || this.editorOpen()) return;

    void Swal.fire({
        title: 'Cargando datos...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const data = await firstValueFrom(
            this.jobsService.getById(jobId).pipe(
                takeUntilDestroyed(this.destroyRef)
            )
        );

        Swal.close();

        this.isDuplicating.set(duplicate);
        this.editingId.set(duplicate ? null : jobId);
        this.clientSearchModal.set('');
        this.showClientList.set(false);
        this.necessaryMaterials.set([]);
        this.selectedMaterialIds.set(new Set());
        this.blueprintFiles.set([]);

        this.existingBlueprintUrls.set(
            duplicate ? [] : data.blueprintUrls || []
        );

        let descripcion = data.description || '';

        if (descripcion.includes('[MATERIALES PRE-ASIGNADOS]:')) {
            descripcion = descripcion
                .split('[MATERIALES PRE-ASIGNADOS]:')[0]
                .trim();
        }

        const managerId = data.managerId ?? this.managerFijoId;
        this.ensureManagerInList(managerId);

        this.form.reset({
            clientName: data.clientName || '',
            clientPhone: data.clientPhone || '',
            address: data.address || '',
            buildingNumber: data.buildingNumber ?? '',
            apartment: data.apartment ?? '',
            latitude: data.latitude,
            longitude: data.longitude,
            employeeId: String(data.employeeId || ''),
            managerId: String(managerId),
            description: descripcion,
            priority: data.priority ?? 2,
            jobDate: this.fechaParaInput(data.jobDate),
            pay: data.pay || 0,
            safeDepositBoxCodes: data.safeDepositBoxCodes || '',
            quickbooksInvoice: duplicate
                ? ''
                : data.quickbooksInvoice || '',
            status: duplicate
                ? 'PENDING'
                : data.status || 'PENDING'
        });

        const mats = data.materials || [];
        const set = new Set<number>();

        mats.forEach((m) => {
            const id = m.materialId;
            set.add(id);

            const info = this.materials().find(
                (x) => x.materialId === id
            );

            this.addNecessary(
                info || {
                    materialId: id,
                    name: m.name || 'Material',
                    count: 0,
                    price: m.price || 0,
                    categoryName: '',
                    unit: m.unit || ''
                },
                m.quantity ?? 1
            );
        });

        this.selectedMaterialIds.set(set);

        const editorCmp = this.editor();

        editorCmp.swalOptions = {
            ...this.editorOptions,
            confirmButtonText: duplicate
                ? 'Guardar duplicado'
                : 'Guardar cambios',
            showDenyButton: true,
            denyButtonText: 'Guardar y enviar correo',
            denyButtonColor: '#1565c0'
        };

        this.editorOptions = editorCmp.swalOptions;
        this.editorOpen.set(true);

        const result = await editorCmp.fire();

        this.editorOpen.set(false);
        this.destroyMap();

        if (result.isDismissed) {
            await this.volverAlCalendario();
            return;
        }

        if (
            (result.isConfirmed || result.isDenied)
            && !this.destroyRef.destroyed
        ) {
            void Swal.fire({
                title: this.isDuplicating()
                    ? 'Creando copia...'
                    : 'Actualizando trabajo...',
                text: 'Por favor, espera.',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                await this.persistJob(result.isDenied);

                await Swal.fire({
                    icon: 'success',
                    title: '¡Éxito!',
                    text: this.isDuplicating()
                        ? 'Copia creada correctamente. El trabajo original no fue modificado.'
                        : 'Trabajo actualizado correctamente.',
                    confirmButtonColor: '#12CFF4'
                });

                await this.volverAlCalendario();
            } catch (error: unknown) {
                await Swal.fire(
                    'Error',
                    this.getErrorMessage(error),
                    'error'
                );
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
        this.isDuplicating.set(false);

        if (this.editorOpen()) {
            this.editorOpen.set(false);
            this.destroyMap();
        }
    }
}

    submitEditor(): void {
        if (!this.isSaving()) Swal.clickConfirm();
    }

    duplicateFromEditor(): void {
        if (
            this.isSaving()
            || this.editingId() === null
            || this.isDuplicating()
        ) {
            return;
        }

        // Al no tener ID, persistJob utilizará create() en lugar de update().
        this.editingId.set(null);
        this.isDuplicating.set(true);

        // Conservamos los datos escritos, pero la copia inicia como trabajo nuevo.
        this.form.patchValue({
            status: 'PENDING',
            quickbooksInvoice: ''
        });

        // Los planos guardados pertenecen al original.
        // Los archivos nuevos seleccionados sí se mantienen para la copia.
        this.existingBlueprintUrls.set([]);

        Swal.resetValidationMessage();

        Swal.update({
            confirmButtonText: 'Guardar copia',
            denyButtonText: 'Guardar copia y enviar correo'
        });

        // Quitar el botón Eliminar porque ya no es edición
        this.removeDeleteButtonFromSwal();
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

    private async persistJob(
        sendNotification: boolean = false
    ): Promise<Job | false> {
        this.isSaving.set(true);
        try {
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
                sendNotification,
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
        } finally {
            this.isSaving.set(false);
        }
    }

    async deleteJob(job: Job): Promise<void> {
        if (this.deletingId() !== null) return;
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
                cancelButtonColor: '#2E3238'
            });

            if (result.isConfirmed && !this.destroyRef.destroyed) {
                Swal.fire({
                    title: 'Eliminando trabajo...',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    showConfirmButton: false,
                    didOpen: () => Swal.showLoading()
                });

                try {
                    await firstValueFrom(
                        this.jobsService
                            .delete(job.jobId)
                            .pipe(takeUntilDestroyed(this.destroyRef))
                    );
                    this.jobs.update((list) =>
                        list.filter((j) => j.jobId !== job.jobId)
                    );
                    await Swal.fire({
                        icon: 'success',
                        title: '¡Eliminado!',
                        text: 'El trabajo fue eliminado.',
                        confirmButtonColor: '#12CFF4'
                    });
                } catch (error: unknown) {
                    await Swal.fire('Error', this.getErrorMessage(error, true), 'error');
                }
            }
        } finally {
            this.deletingId.set(null);
        }
    }

    // ---------- ELIMINAR DESDE EL MODAL ----------

    /** Inserta el botón Eliminar en la barra de acciones de SweetAlert (solo al editar). */
    private injectDeleteButtonInSwal(): void {
        // Solo al editar un trabajo existente (no crear ni duplicar)
        if (this.editingId() === null || this.isDuplicating()) {
            this.removeDeleteButtonFromSwal();
            return;
        }

        const actions = document.querySelector('.swal2-actions') as HTMLElement | null;
        if (!actions) return;

        // Evitar duplicados
        if (actions.querySelector('.btn-swal-delete')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swal2-styled btn-swal-delete';
        btn.textContent = 'Eliminar';
        btn.setAttribute('aria-label', 'Eliminar trabajo');

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.isSaving()) {
                void this.deleteFromEditor();
            }
        });

        // Orden: Guardar | Guardar y enviar correo | Eliminar | Cancelar
        const cancelBtn = actions.querySelector('.swal2-cancel');
        if (cancelBtn) {
            actions.insertBefore(btn, cancelBtn);
        } else {
            actions.appendChild(btn);
        }
    }

    /** Quita el botón Eliminar del DOM de SweetAlert. */
    private removeDeleteButtonFromSwal(): void {
        const btn = document.querySelector('.swal2-actions .btn-swal-delete');
        btn?.remove();
    }

    /**
     * Elimina el trabajo que se está editando desde el modal.
     * Si la eliminación se confirma y tiene éxito, cierra el editor.
     */
    async deleteFromEditor(): Promise<void> {
        const id = this.editingId();
        if (id === null || this.isSaving() || this.isDuplicating()) return;

        const job = this.jobs().find((j) => j.jobId === id);
        if (!job) return;

        const deleted = await this.deleteJobFromEditor(job);
        if (deleted && !this.destroyRef.destroyed) {
            if (Swal.isVisible()) {
                Swal.close();
            }
            this.editorOpen.set(false);
            this.editingId.set(null);
        }
    }

    /**
     * Confirmación + borrado desde el modal. Devuelve true si se eliminó correctamente.
     */
    private async deleteJobFromEditor(job: Job): Promise<boolean> {
        if (this.deletingId() !== null) return false;

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
                return true;
            }
            return false;
        } finally {
            this.deletingId.set(null);
        }
    }

    // ---------- VALIDACIÓN AL DUPLICAR ----------

    private normalizeText(v: string | null | undefined): string {
        return (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    /**
     * Devuelve un mensaje si ya existe un trabajo del mismo cliente y dirección
     * con la misma fecha + edificio + departamento. Si no, devuelve null.
     * - Fecha nueva → OK.
     * - Fecha repetida → debe cambiar edificio o departamento.
     * - Fecha, edificio y departamento repetidos → error.
     */
    private duplicateConflict(
        clientName: string,
        address: string,
        date: string,
        building: string,
        apartment: string
    ): string | null {
        const cliente = this.normalizeText(clientName);
        const direccion = this.normalizeText(address);
        const bld = this.normalizeText(building);
        const apt = this.normalizeText(apartment);

        const existe = this.jobs().some(
            (j) =>
                this.normalizeText(j.clientName) === cliente &&
                this.normalizeText(j.address) === direccion &&
                this.fechaParaInput(j.jobDate) === date &&
                this.normalizeText(j.buildingNumber) === bld &&
                this.normalizeText(j.apartment) === apt
        );

        return existe
            ? 'Ya existe un trabajo con esa fecha, edificio y departamento. ' +
            'Cambia la fecha, o cambia el edificio/departamento.'
            : null;
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
                    a.state || a.province || '',
                    a.country || ''
                ].filter(Boolean);
                this.form.controls.address.setValue(partes.join(', '));
            })
            .catch(() => undefined);
    }

    // ======================================================
    // BÚSQUEDA DE DIRECCIONES
    // ======================================================

    searchAddressOnMap(): void {
        const textoOriginal = this.form.controls.address.value?.trim();
        if (!textoOriginal) return;

        // 1. Coordenadas pegadas (lat, lng)
        const regexCoords = /^[-+]?\d+(\.\d+)?\s*,\s*[-+]?\d+(\.\d+)?$/;
        if (regexCoords.test(textoOriginal)) {
            const [latStr, lngStr] = textoOriginal.split(',');
            const latV = parseFloat(latStr.trim());
            const lngV = parseFloat(lngStr.trim());
            if (!isNaN(latV) && !isNaN(lngV)) {
                this.setMapPosition(latV, lngV, false);
            }
            return;
        }

        // 2. Normalizar y buscar
        const texto = this.normalizeAddress(textoOriginal);

        fetch(
            `https://nominatim.openstreetmap.org/search?` +
            `format=json&q=${encodeURIComponent(texto)}` +
            `&addressdetails=1&limit=5&accept-language=es,en`
        )
            .then((r) => r.json())
            .then((results: any[]) => {
                if (results?.length > 0) {
                    const best = results[0];
                    this.setMapPosition(parseFloat(best.lat), parseFloat(best.lon), false);
                } else {
                    void Swal.fire({
                        icon: 'warning',
                        title: 'No encontrado',
                        text: 'No se encontró esa dirección. Intenta ser más específico o mueve el marcador en el mapa.',
                        confirmButtonColor: '#12CFF4',
                        timer: 3200,
                        timerProgressBar: true
                    });
                }
            })
            .catch((err) => {
                console.error('Error geocoding:', err);
                void Swal.fire({
                    icon: 'error',
                    title: 'Error de búsqueda',
                    text: 'No se pudo buscar la dirección. Intenta de nuevo.',
                    confirmButtonColor: '#12CFF4'
                });
            });
    }

    /** Normaliza fracciones y abreviaturas para mejorar resultados de Nominatim */
    private normalizeAddress(address: string): string {
        return address
            .replace(/\b(\d+)\s+1\/2\b/gi, '$1th')
            .replace(/\b(\d+)\s+½\b/gi, '$1th')
            .replace(/\b(\d+)\s+1\/4\b/gi, '$1th')
            .replace(/\b(\d+)\s+3\/4\b/gi, '$1th')
            .replace(/\bSt\b\.?/gi, 'Street')
            .replace(/\bAve\b\.?/gi, 'Avenue')
            .replace(/\bBlvd\b\.?/gi, 'Boulevard')
            .replace(/\bRd\b\.?/gi, 'Road')
            .replace(/\bDr\b\.?/gi, 'Drive')
            .replace(/\bLn\b\.?/gi, 'Lane')
            .replace(/\bCt\b\.?/gi, 'Court')
            .replace(/\bW\b(?=\s)/gi, 'West')
            .replace(/\bE\b(?=\s)/gi, 'East')
            .replace(/\bN\b(?=\s)/gi, 'North')
            .replace(/\bS\b(?=\s)/gi, 'South')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Coloca el marcador y actualiza lat/lng.
     * @param updateAddress Si true, hace reverse geocode y reescribe el input.
     */
    private setMapPosition(lat: number, lng: number, updateAddress = true): void {
        this.form.controls.latitude.setValue(Number(lat.toFixed(6)));
        this.form.controls.longitude.setValue(Number(lng.toFixed(6)));

        if (this.map && this.marker) {
            this.marker.setLatLng([lat, lng]);
            this.map.setView([lat, lng], 17);
            setTimeout(() => {
                this.map?.invalidateSize(true);
            }, 100);
        }

        if (updateAddress) {
            this.reverseGeocode(lat, lng);
        }
    }

    onAddressKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
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
                this.setMapPosition(lat, lng, true);
            },
            () => {
                void Swal.fire('Error', 'No se pudo obtener tu ubicación.', 'error');
            },
            { enableHighAccuracy: true }
        );
    }

    // ---------- UI helpers ----------

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
            case 'REVIEW':
                return { label: 'Revisión', className: 'badge badge-review' };
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