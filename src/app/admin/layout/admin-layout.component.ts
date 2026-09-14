import { Component, inject, signal } from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import Swal from 'sweetalert2';

import { AuthService } from '../../core/services/auth.service';

interface AdminMenuItem {
  label: string;
  icon: string;
  route: string | null;
}

export interface AdminPageInfo {
  heading: string;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css'
})
export class AdminLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly email = this.authService.email;
  readonly roles = this.authService.roles;
  readonly isLeaving = signal(false);

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let snapshot = this.route.snapshot;

        while (snapshot.firstChild) {
          snapshot = snapshot.firstChild;
        }

        const heading: unknown = snapshot.data['heading'];

        return typeof heading === 'string'
          ? heading
          : 'Resumen del Sistema';
      })
    ),
    { initialValue: 'Resumen del Sistema' }
  );

  readonly menuItems: readonly AdminMenuItem[] = [
    {
      label: 'Inicio',
      icon: 'fa-solid fa-house',
      route: '/admin/dashboard'
    },
    {
      label: 'Usuarios',
      icon: 'fa-solid fa-users-gear',
      route: null
    },
    {
      label: 'Trabajos',
      icon: 'fa-solid fa-hammer',
      route: null
    },
    {
      label: 'Evidencias',
      icon: 'fa-solid fa-camera',
      route: null
    },
    {
      label: 'Categorías',
      icon: 'fa-solid fa-tags',
      route: '/admin/categorias'
    },
    {
      label: 'Materiales',
      icon: 'fa-solid fa-boxes-stacked',
      route: null
    }
  ];

  async openExitDialog(): Promise<void> {
    if (this.isLeaving()) {
      return;
    }

    this.isLeaving.set(true);

    try {
      const hasMultipleRoles = this.roles().length > 1;

      const result = await Swal.fire({
        title: hasMultipleRoles
          ? '¿Qué deseas hacer?'
          : '¿Cerrar sesión?',
        text: hasMultipleRoles
          ? 'Selecciona si deseas salir del panel o cambiar tu rol de trabajo.'
          : '¿Estás seguro que deseas salir del panel?',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: hasMultipleRoles,
        confirmButtonText: 'Sí, salir',
        denyButtonText: 'Cambiar de Rol',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0f4c81',
        denyButtonColor: '#00B8A9',
        cancelButtonColor: '#d33'
      });

      if (result.isConfirmed) {
        this.authService.logout();

        await this.router.navigateByUrl('/auth/login', {
          replaceUrl: true
        });
      } else if (result.isDenied) {
        await this.router.navigateByUrl('/auth/role-selector');
      }
    } finally {
      this.isLeaving.set(false);
    }
  }
}