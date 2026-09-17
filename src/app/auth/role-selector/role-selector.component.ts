import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  SwalComponent,
  SwalPortalDirective,
  SwalPortalTargets
} from '@sweetalert2/ngx-sweetalert2';
import Swal, { SweetAlertOptions } from 'sweetalert2';

import { AuthService } from '../../core/services/auth.service';
import { AppRole } from '../../core/models/auth.model';

interface RoleOption {
  role: AppRole;
  label: string;
  className: string;
  route: string;
}

@Component({
  selector: 'app-role-selector',
  standalone: true,
  imports: [SwalComponent, SwalPortalDirective],
  templateUrl: './role-selector.component.html',
  styleUrl: './role-selector.component.css'
})
export class RoleSelectorComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isNavigating = signal(false);
  readonly swalTargets = inject(SwalPortalTargets);

  private readonly options: readonly RoleOption[] = [
    { role: 'ROLE_BODEGUERO', label: 'Entrar como Bodeguero', className: 'role-button bodeguero', route: '/bodeguero/bodega' },
    {
      role: 'ROLE_ADMIN',
      label: 'Entrar como Administrador',
      className: 'role-button admin',
      route: '/admin/dashboard'
    },
    {
      role: 'ROLE_JEFE',
      label: 'Entrar como Manager',
      className: 'role-button jefe',
      route: '/jefe/dashboard'
    },
    {
      role: 'ROLE_EMPLOYEE',
      label: 'Entrar como Subcontratista',
      className: 'role-button employee',
      route: '/employee/dashboard'
    }
  ];

  readonly availableRoles = computed(() =>
    this.options.filter((option) =>
      this.authService.roles().includes(option.role)
    )
  );

  readonly modalOptions: SweetAlertOptions = {
    title: 'Elige tu perfil',
    icon: 'info',
    iconColor: '#12CFF4',
    showConfirmButton: false,
    showCloseButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    background: '#FFFFFF',
    color: '#0F2D4A',
    padding: '2.5em',
    width: 560
  };

  async chooseRole(option: RoleOption): Promise<void> {
    if (this.isNavigating()) {
      return;
    }

    if (!this.authService.selectRole(option.role)) {
      Swal.showValidationMessage(
        'Este perfil no está disponible para tu sesión.'
      );
      return;
    }

    this.isNavigating.set(true);

    try {
      const navigated = await this.router.navigateByUrl(option.route);

      if (!navigated) {
        Swal.showValidationMessage(
          'No se pudo abrir el perfil. Intenta nuevamente.'
        );
      }
    } catch {
      Swal.showValidationMessage(
        'No se pudo abrir el perfil. Intenta nuevamente.'
      );
    } finally {
      this.isNavigating.set(false);
    }
  }

  logout(): void {
    if (this.isNavigating()) {
      return;
    }

    this.authService.logout();

    void this.router.navigateByUrl('/auth/login', {
      replaceUrl: true
    });
  }
}