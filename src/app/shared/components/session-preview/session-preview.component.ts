import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../../core/services/auth.service';
import { AppRole } from '../../../core/models/auth.model';

@Component({
    selector: 'app-session-preview',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './session-preview.component.html',
    styleUrl: './session-preview.component.css'
})
export class SessionPreviewComponent {
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);

    readonly email = this.authService.email;
    readonly roles = this.authService.roles;

    private readonly roleLabels: Record<AppRole, string> = {
        ROLE_ADMIN: 'Administrador',
        ROLE_JEFE: 'Manager',
        ROLE_EMPLOYEE: 'Subcontratista'
    };

    readonly profileLabel = computed(() => {
        const role = this.authService.activeRole();

        return role === null ? '' : this.roleLabels[role];
    });

    async logout(): Promise<void> {
        const result = await Swal.fire({
            icon: 'question',
            title: '¿Cerrar sesión?',
            text: 'Tendrás que ingresar tus credenciales nuevamente.',
            showCancelButton: true,
            confirmButtonText: 'Cerrar sesión',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#12CFF4',
            cancelButtonColor: '#2E3238'
        });

        if (!result.isConfirmed) {
            return;
        }

        this.authService.logout();

        await this.router.navigateByUrl('/auth/login', {
            replaceUrl: true
        });
    }
}