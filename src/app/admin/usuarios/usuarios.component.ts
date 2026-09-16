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

import { User } from '../../core/models/user.model';
import { UsersService } from '../../core/services/users.service';

const AVAILABLE_ROLES = [
    { value: 'ROLE_ADMIN', label: 'Administrador' },
    { value: 'ROLE_JEFE', label: 'Jefe' },
    { value: 'ROLE_EMPLOYEE', label: 'Empleado' }
] as const;

@Component({
    selector: 'app-usuarios',
    standalone: true,
    imports: [ReactiveFormsModule, SwalComponent, SwalPortalDirective],
    templateUrl: './usuarios.component.html',
    styleUrl: './usuarios.component.css'
})
export class UsuariosComponent implements OnInit {
    private readonly usersService = inject(UsersService);
    private readonly formBuilder = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);

    private readonly editor = viewChild.required<SwalComponent>('editor');

    readonly swalTargets = inject(SwalPortalTargets);
    readonly availableRoles = AVAILABLE_ROLES;

    readonly users = signal<readonly User[]>([]);
    readonly isLoading = signal(false);
    readonly isSaving = signal(false);
    readonly editorOpen = signal(false);
    readonly loadError = signal(false);
    readonly editingId = signal<number | null>(null);
    readonly searchText = signal('');
    readonly statusFilter = signal<'Active' | 'Unemployed' | 'All'>('Active');

    readonly form = this.formBuilder.nonNullable.group({
        dni: ['', Validators.required],
        firstName: ['', Validators.required],
        middleName: [''],
        lastName: ['', Validators.required],
        secondSurname: [''],
        email: ['', [Validators.required, Validators.email]],
        password: [''],
        phone: ['', Validators.required],
        dateOfBirth: ['', Validators.required],
        dateOfEntry: ['', Validators.required],
        status: ['Active', Validators.required],
        title: ['', Validators.required],
        color: ['#12cff4', Validators.required],
        roleAdmin: [false],
        roleJefe: [false],
        roleEmployee: [false]
    });

    readonly editorOptions: SweetAlertOptions = {
        width: 640,
        showCancelButton: true,
        showCloseButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2e7d32',
        cancelButtonColor: '#2E3238',
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !this.isSaving(),
        allowEscapeKey: () => !this.isSaving(),
        preConfirm: () => this.persistUser()
    };

    constructor() {
        // AÑADIDO: Libera la pantalla si cambias de pestaña o destruyes el componente
        this.destroyRef.onDestroy(() => {
            if (Swal.isVisible()) Swal.close();
        });
    }

    readonly filteredUsers = () => {
        let list = [...this.users()];
        const status = this.statusFilter();
        const text = this.searchText().trim().toLowerCase();

        // 1. Filtro por estado
        if (status === 'Active') {
            list = list.filter(
                (u) => u.status === 'Active' || !u.status
            );
        } else if (status === 'Unemployed') {
            list = list.filter((u) => u.status === 'Unemployed');
        }

        // 2. Multibúsqueda
        if (text) {
            list = list.filter((u) => {
                const dni = (u.dni ?? '').toLowerCase();
                const first = (u.firstName ?? '').toLowerCase();
                const last = (u.lastName ?? '').toLowerCase();
                const full = `${first} ${last}`.trim();
                const fallback = (u.name ?? '').toLowerCase();

                return (
                    dni.includes(text) ||
                    first.includes(text) ||
                    last.includes(text) ||
                    full.includes(text) ||
                    fallback.includes(text)
                );
            });
        }

        return list;
    };


    ngOnInit(): void {
        void this.loadUsers();
    }

    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.searchText.set(value);
    }

    onStatusChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value as
            | 'Active'
            | 'Unemployed'
            | 'All';
        this.statusFilter.set(value);
    }

    clearFilters(): void {
        this.searchText.set('');
        this.statusFilter.set('Active');
    }

    async loadUsers(): Promise<void> {
        if (this.isLoading() || this.editorOpen()) {
            return;
        }

        this.isLoading.set(true);
        this.loadError.set(false);

        // MODAL DE CARGA AÑADIDO
        void Swal.fire({
            title: 'Cargando usuarios...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const users = await firstValueFrom(
                this.usersService.getAll().pipe(takeUntilDestroyed(this.destroyRef))
            );
            this.users.set(users);
            
            if (Swal.isVisible()) {
                Swal.close();
            }
        } catch (error: unknown) {
            if (this.destroyRef.destroyed) {
                return;
            }
            this.loadError.set(true);
            
            await Swal.fire({
                icon: 'error',
                title: 'No se pudieron cargar los usuarios',
                text: this.getErrorMessage(error),
                confirmButtonColor: '#12CFF4'
            });
        } finally {
            this.isLoading.set(false);
        }
    }

    async openEditor(user?: User): Promise<void> {
        if (this.isLoading() || this.editorOpen()) {
            return;
        }

        this.editingId.set(user?.userId ?? null);

        const roleNames = new Set(
            (user?.roles ?? []).map((r) => r.name)
        );

        this.form.reset({
            dni: user?.dni ?? '',
            firstName: user?.firstName ?? '',
            middleName: user?.middleName ?? '',
            lastName: user?.lastName ?? '',
            secondSurname: user?.secondSurname ?? '',
            email: user?.email ?? '',
            password: '',
            phone: user?.phone ?? '',
            dateOfBirth: user?.dateOfBirth
                ? String(user.dateOfBirth).slice(0, 10)
                : '',
            dateOfEntry: user?.dateOfEntry
                ? String(user.dateOfEntry).slice(0, 10)
                : '',
            status: user?.status ?? 'Active',
            title: user?.title ?? '',
            color: user?.color ?? '#12cff4',
            roleAdmin: roleNames.has('ROLE_ADMIN'),
            roleJefe: roleNames.has('ROLE_JEFE'),
            roleEmployee: roleNames.has('ROLE_EMPLOYEE')
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
                    text: user ? 'Usuario actualizado.' : 'Usuario creado.',
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

    fullName(user: User): string {
        return [
            user.firstName,
            user.middleName,
            user.lastName,
            user.secondSurname
        ]
            .filter(Boolean)
            .join(' ');
    }

    rolesLabel(user: User): string {
        if (!user.roles?.length) {
            return '—';
        }
        return user.roles
            .map((r) => {
                if (r.name === 'ROLE_ADMIN') return 'Admin';
                if (r.name === 'ROLE_JEFE') return 'Jefe';
                if (r.name === 'ROLE_EMPLOYEE') return 'Empleado';
                return r.name;
            })
            .join(', ');
    }

    private async persistUser(): Promise<User | false> {
        if (this.isSaving()) {
            return false;
        }

        this.form.markAllAsTouched();

        const raw = this.form.getRawValue();
        const roles: string[] = [];
        if (raw.roleAdmin) roles.push('ROLE_ADMIN');
        if (raw.roleJefe) roles.push('ROLE_JEFE');
        if (raw.roleEmployee) roles.push('ROLE_EMPLOYEE');

        if (this.form.invalid) {
            Swal.showValidationMessage('Revisa los campos obligatorios.');
            return false;
        }

        if (roles.length === 0) {
            Swal.showValidationMessage('Debes asignar al menos un rol.');
            return false;
        }

        const isCreate = this.editingId() === null;
        if (isCreate && !raw.password.trim()) {
            Swal.showValidationMessage('La contraseña es obligatoria al crear.');
            return false;
        }

        this.isSaving.set(true);

        const request = {
            dni: raw.dni.trim(),
            firstName: raw.firstName.trim(),
            middleName: raw.middleName.trim() || null,
            lastName: raw.lastName.trim(),
            secondSurname: raw.secondSurname.trim() || null,
            email: raw.email.trim(),
            password: raw.password.trim() || null,
            phone: raw.phone.trim(),
            dateOfBirth: raw.dateOfBirth,
            dateOfEntry: raw.dateOfEntry,
            status: raw.status,
            title: raw.title.trim(),
            roles,
            color: raw.color
        };

        const userId = this.editingId();
        const apiCall =
            userId === null
                ? this.usersService.create(request)
                : this.usersService.update(userId, request);

        try {
            const saved = await firstValueFrom(
                apiCall.pipe(takeUntilDestroyed(this.destroyRef))
            );

            this.users.update((list) =>
                userId === null
                    ? [...list, saved]
                    : list.map((u) => (u.userId === userId ? saved : u))
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

    private getErrorMessage(error: unknown): string {
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

        return 'No se pudo completar la operación. Revisa los datos e intenta nuevamente.';
    }
}