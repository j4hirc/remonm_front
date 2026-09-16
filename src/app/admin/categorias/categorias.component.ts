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
import { CategoriesService } from '../../core/services/categories.service';

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    SwalComponent,
    SwalPortalDirective
  ],
  templateUrl: './categorias.component.html',
  styleUrl: './categorias.component.css'
})
export class CategoriasComponent implements OnInit {
  private readonly categoriesService = inject(CategoriesService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private readonly editor = viewChild.required<SwalComponent>('editor');

  readonly swalTargets = inject(SwalPortalTargets);

  readonly categories = signal<readonly Category[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly editorOpen = signal(false);
  readonly deletingId = signal<number | null>(null);
  readonly loadError = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required]
  });

  readonly editorOptions: SweetAlertOptions = {
    width: 450,
    showCancelButton: true,
    showCloseButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#2e7d32',
    cancelButtonColor: '#2E3238',
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !this.isSaving(),
    allowEscapeKey: () => !this.isSaving(),
    preConfirm: () => this.persistCategory()
  };

  constructor() {
    // AÑADIDO: Libera la pantalla si cambias de pestaña o destruyes el componente
    this.destroyRef.onDestroy(() => {
      if (Swal.isVisible()) Swal.close();
    });
  }

  ngOnInit(): void {
    void this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    if (this.isLoading() || this.editorOpen() || this.deletingId() !== null) {
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(false);

    // MODAL DE CARGA AÑADIDO
    void Swal.fire({
      title: 'Cargando categorías...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      const categories = await firstValueFrom(
        this.categoriesService.getAll().pipe(
          takeUntilDestroyed(this.destroyRef)
        )
      );

      this.categories.set(categories);
      
      // Cerramos el modal de carga porque tuvimos éxito
      if (Swal.isVisible()) {
        Swal.close();
      }
    } catch (error: unknown) {
      if (this.destroyRef.destroyed) {
        return;
      }

      this.loadError.set(true);

      // Al lanzar un nuevo Swal.fire, SweetAlert2 sobrescribe automáticamente
      // el modal de carga actual por el modal de error.
      await Swal.fire({
        icon: 'error',
        title: 'No se pudieron cargar las categorías',
        text: this.getErrorMessage(error),
        confirmButtonColor: '#12CFF4'
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async openEditor(category?: Category): Promise<void> {
    if (
      this.isLoading() ||
      this.editorOpen() ||
      this.deletingId() !== null
    ) {
      return;
    }

    this.editingId.set(category?.categoryId ?? null);
    this.form.reset({ name: category?.name ?? '' });
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
          text: category
            ? 'Categoría actualizada.'
            : 'Categoría creada.',
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

  private async persistCategory(): Promise<Category | false> {
    if (this.isSaving()) {
      return false;
    }

    const name = this.form.controls.name.value.trim();
    this.form.controls.name.setValue(name);
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      Swal.showValidationMessage(
        'El nombre de la categoría no puede estar vacío.'
      );
      return false;
    }

    this.isSaving.set(true);

    const categoryId = this.editingId();

    const request = categoryId === null
      ? this.categoriesService.create({ name })
      : this.categoriesService.update(categoryId, { name });

    try {
      const savedCategory = await firstValueFrom(
        request.pipe(takeUntilDestroyed(this.destroyRef))
      );

      this.categories.update((categories) =>
        categoryId === null
          ? [...categories, savedCategory]
          : categories.map((category) =>
              category.categoryId === categoryId
                ? savedCategory
                : category
            )
      );

      return savedCategory;
    } catch (error: unknown) {
      if (!this.destroyRef.destroyed) {
        Swal.showValidationMessage(this.getErrorMessage(error));
      }

      return false;
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteCategory(category: Category): Promise<void> {
    if (
      this.isLoading() ||
      this.editorOpen() ||
      this.deletingId() !== null
    ) {
      return;
    }

    this.deletingId.set(category.categoryId);

    try {
      const result = await Swal.fire({
        title: '¿Eliminar Categoría?',
        text: `Se eliminará "${category.name}". Esta acción no se puede deshacer.`,
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
              this.categoriesService
                .delete(category.categoryId)
                .pipe(takeUntilDestroyed(this.destroyRef))
            );

            this.categories.update((categories) =>
              categories.filter(
                (item) => item.categoryId !== category.categoryId
              )
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
          title: '¡Eliminada!',
          text: 'La categoría fue borrada de la base de datos.',
          confirmButtonColor: '#12CFF4'
        });
      }
    } finally {
      this.deletingId.set(null);
    }
  }

  private getErrorMessage(
    error: unknown,
    deleting = false
  ): string {
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

      // HttpErrorResponse puede contener JSON o texto.
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
      ? 'No se pudo eliminar. Verifica que la categoría no esté siendo utilizada en otros registros.'
      : 'No se pudo completar la operación. Revisa los datos e intenta nuevamente.';
  }
}