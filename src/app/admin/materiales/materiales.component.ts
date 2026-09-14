import {
    Component,
    DestroyRef,
    inject,
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

import { Category } from '../../core/models/category.model';
import { Material } from '../../core/models/material.model';
import { CategoriesService } from '../../core/services/categories.service';
import { MaterialsService } from '../../core/services/materials.service';

@Component({
    selector: 'app-materiales',
    standalone: true,
    imports: [ReactiveFormsModule, SwalComponent, SwalPortalDirective],
    templateUrl: './materiales.component.html',
    styleUrl: './materiales.component.css'
})
export class MaterialesComponent implements OnInit {
    private readonly materialsService = inject(MaterialsService);
    private readonly categoriesService = inject(CategoriesService);
    private readonly formBuilder = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);

    private readonly editor = viewChild.required<SwalComponent>('editor');

    readonly swalTargets = inject(SwalPortalTargets);

    readonly materials = signal<readonly Material[]>([]);
    readonly categories = signal<readonly Category[]>([]);
    readonly isLoading = signal(false);
    readonly isSaving = signal(false);
    readonly editorOpen = signal(false);
    readonly deletingId = signal<number | null>(null);
    readonly loadError = signal(false);
    readonly editingId = signal<number | null>(null);
    readonly searchText = signal('');
    readonly categoryFilter = signal('todos'); // 'todos' | nombre de categoría en minúsculas

    readonly form = this.formBuilder.nonNullable.group({
        name: ['', Validators.required],
        count: [0, [Validators.required, Validators.min(0)]],
        price: [0, [Validators.required, Validators.min(0)]],
        unit: [''],
        // El <select> siempre entrega string; convertimos al guardar.
        categoryId: ['0', [Validators.required, Validators.pattern(/^[1-9]\d*$/)]]
    });

    readonly editorOptions: SweetAlertOptions = {
        width: 520,
        showCancelButton: true,
        showCloseButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2e7d32',
        cancelButtonColor: '#2E3238',
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !this.isSaving(),
        allowEscapeKey: () => !this.isSaving(),
        preConfirm: () => this.persistMaterial()
    };

    readonly filteredMaterials = () => {
        let list = [...this.materials()];
        const text = this.searchText().trim().toLowerCase();
        const category = this.categoryFilter();

        // 1. Buscar por nombre
        if (text) {
            list = list.filter(
                (mat) => mat.name && mat.name.toLowerCase().includes(text)
            );
        }

        // 2. Filtrar por categoría
        if (category !== 'todos') {
            list = list.filter((mat) => {
                if (!mat.categoryName) return false;
                return mat.categoryName.toLowerCase().trim() === category;
            });
        }

        // 3. Orden alfabético (insensible a mayúsculas y acentos)
        list.sort((a, b) => {
            const nombreA = a.name || '';
            const nombreB = b.name || '';
            return nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
        });

        return list;
    };

    ngOnInit(): void {
        void this.loadMaterials();
        void this.loadCategories();
    }

    async loadMaterials(): Promise<void> {
        if (this.isLoading() || this.editorOpen() || this.deletingId() !== null) {
            return;
        }

        this.isLoading.set(true);
        this.loadError.set(false);

        try {
            const materials = await firstValueFrom(
                this.materialsService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
            );

            this.materials.set(materials);
        } catch (error: unknown) {
            if (this.destroyRef.destroyed) {
                return;
            }

            this.loadError.set(true);

            await Swal.fire({
                icon: 'error',
                title: 'No se pudieron cargar los materiales',
                text: this.getErrorMessage(error),
                confirmButtonColor: '#12CFF4'
            });
        } finally {
            this.isLoading.set(false);
        }
    }

    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.searchText.set(value);
    }

    onCategoryFilterChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        this.categoryFilter.set(value);
    }

    clearFilters(): void {
        this.searchText.set('');
        this.categoryFilter.set('todos');
    }

    private async loadCategories(): Promise<void> {
        try {
            const categories = await firstValueFrom(
                this.categoriesService
                    .getAll()
                    .pipe(takeUntilDestroyed(this.destroyRef))
            );

            this.categories.set(categories);
        } catch {
            // Si falla, el select quedará vacío y la validación lo detectará.
        }
    }

    async openEditor(material?: Material): Promise<void> {
        if (
            this.isLoading() ||
            this.editorOpen() ||
            this.deletingId() !== null
        ) {
            return;
        }

        this.editingId.set(material?.materialId ?? null);

        // Al editar no tenemos categoryId en el response; buscamos por nombre.
        let categoryId = 0;
        if (material) {
            const match = this.categories().find(
                (c) => c.name === material.categoryName
            );
            categoryId = match?.categoryId ?? 0;
        }

        this.form.reset({
            name: material?.name ?? '',
            count: material?.count ?? 0,
            price: material?.price ?? 0,
            unit: material?.unit ?? '',
            categoryId: String(categoryId || 0)
        });

        this.editorOpen.set(true);

        try {
            const result = await this.editor().fire();

            if (this.destroyRef.destroyed) {
                return;
            }

            if (result.isConfirmed) {
                await Swal.fire({
                    icon: 'success',
                    title: '¡Éxito!',
                    text: material
                        ? 'Material actualizado.'
                        : 'Material creado.',
                    confirmButtonColor: '#12CFF4'
                });
            }
        } finally {
            this.editorOpen.set(false);
        }
    }

    submitEditor(): void {
        if (!this.isSaving()) {
            Swal.clickConfirm();
        }
    }

    private async persistMaterial(): Promise<Material | false> {
        if (this.isSaving()) {
            return false;
        }

        const name = this.form.controls.name.value.trim();
        this.form.controls.name.setValue(name);
        this.form.markAllAsTouched();

        if (this.form.invalid) {
            if (this.form.controls.name.invalid) {
                Swal.showValidationMessage(
                    'El nombre del material no puede estar vacío.'
                );
            } else if (this.form.controls.categoryId.invalid) {
                Swal.showValidationMessage('Debes seleccionar una categoría.');
            } else if (this.form.controls.count.invalid) {
                Swal.showValidationMessage(
                    'La cantidad debe ser un número mayor o igual a 0.'
                );
            } else if (this.form.controls.price.invalid) {
                Swal.showValidationMessage(
                    'El precio debe ser un número mayor o igual a 0.'
                );
            } else {
                Swal.showValidationMessage('Revisa los datos del formulario.');
            }
            return false;
        }

        this.isSaving.set(true);

        const materialId = this.editingId();
        const raw = this.form.getRawValue();

        const request = {
            name: raw.name,
            count: Number(raw.count),
            price: Number(raw.price),
            unit: raw.unit?.trim() || null,
            categoryId: Number(raw.categoryId)
        };

        const apiCall =
            materialId === null
                ? this.materialsService.create(request)
                : this.materialsService.update(materialId, request);

        try {
            const saved = await firstValueFrom(
                apiCall.pipe(takeUntilDestroyed(this.destroyRef))
            );

            this.materials.update((list) =>
                materialId === null
                    ? [...list, saved]
                    : list.map((item) =>
                        item.materialId === materialId ? saved : item
                    )
            );

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

    async deleteMaterial(material: Material): Promise<void> {
        if (
            this.isLoading() ||
            this.editorOpen() ||
            this.deletingId() !== null
        ) {
            return;
        }

        this.deletingId.set(material.materialId);

        try {
            const result = await Swal.fire({
                title: '¿Eliminar Material?',
                text: `Se eliminará "${material.name}". Esta acción no se puede deshacer.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#d33',
                cancelButtonColor: '#2E3238',
                showLoaderOnConfirm: true,
                allowOutsideClick: () => !Swal.isLoading(),
                allowEscapeKey: () => !Swal.isLoading(),

                preConfirm: async () => {
                    try {
                        await firstValueFrom(
                            this.materialsService
                                .delete(material.materialId)
                                .pipe(takeUntilDestroyed(this.destroyRef))
                        );

                        this.materials.update((list) =>
                            list.filter((item) => item.materialId !== material.materialId)
                        );

                        return true;
                    } catch (error: unknown) {
                        if (!this.destroyRef.destroyed) {
                            Swal.showValidationMessage(
                                this.getErrorMessage(error, true)
                            );
                        }
                        return false;
                    }
                }
            });

            if (result.isConfirmed && !this.destroyRef.destroyed) {
                await Swal.fire({
                    icon: 'success',
                    title: '¡Eliminado!',
                    text: 'El material fue borrado de la base de datos.',
                    confirmButtonColor: '#12CFF4'
                });
            }
        } finally {
            this.deletingId.set(null);
        }
    }

    formatPrice(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(value ?? 0);
    }

    private getErrorMessage(error: unknown, deleting = false): string {
        if (error instanceof HttpErrorResponse) {
            if (error.status === 0) {
                return 'No se pudo conectar con el servidor.';
            }

            if (error.status === 401) {
                return 'La sesión no es válida o expiró. Cierra sesión e ingresa nuevamente.';
            }

            if (error.status === 403) {
                return 'No tienes permisos para realizar esta operación.';
            }

            let body: unknown = error.error;

            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body) as unknown;
                } catch {
                    body = null;
                }
            }

            if (
                typeof body === 'object' &&
                body !== null &&
                'message' in body &&
                typeof body.message === 'string'
            ) {
                return body.message;
            }
        }

        return deleting
            ? 'No se pudo eliminar. Verifica que el material no esté siendo utilizado en otros registros.'
            : 'No se pudo completar la operación. Revisa los datos e intenta nuevamente.';
    }
}