import { Component, computed, inject, signal } from '@angular/core';
import {
Router,
RouterLink,
RouterLinkActive,
RouterOutlet,
NavigationEnd
} from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/services/auth.service';

interface EmployeeMenuItem {
label: string;
icon: string;
route: string;
}

@Component({
selector: 'app-employee-layout',
standalone: true,
imports: [RouterOutlet, RouterLink, RouterLinkActive],
templateUrl: './employee-layout.component.html',
styleUrl: './employee-layout.component.css'
})
export class EmployeeLayoutComponent {
private readonly authService = inject(AuthService);
private readonly router = inject(Router);

readonly isLeaving = signal(false);
readonly pageTitle = signal('Mi Calendario');

readonly displayName = computed(
() => this.authService.email() || 'Subcontratista'
);

readonly roles = computed(() => this.authService.roles());

readonly menuItems: readonly EmployeeMenuItem[] = [
  {
    label: 'Inicio',
    icon: 'fa-solid fa-house',
    route: '/employee/dashboard'
  },
  {
    label: 'Mi Calendario',
    icon: 'fa-solid fa-calendar-days',
    route: '/employee/calendario'
  },
  {
    label: 'Mis Evidencias',
    icon: 'fa-solid fa-camera',
    route: '/employee/evidencias'
  }
];

constructor() {
this.router.events
.pipe(
filter((e): e is NavigationEnd => e instanceof NavigationEnd),
takeUntilDestroyed()
)
.subscribe(() => {
const url = this.router.url;
if (url.includes('evidencias')) {
  this.pageTitle.set('Mis Evidencias');
} else if (url.includes('calendario')) {
  this.pageTitle.set('Mi Calendario');
} else {
  this.pageTitle.set('Inicio');
}
});
}

async openExitDialog(): Promise<void> {
    if (this.isLeaving()) return;
    this.isLeaving.set(true);

    try {
    const hasMultipleRoles = this.roles().length > 1;

    const result = await Swal.fire({
    title: hasMultipleRoles ? '¿Qué deseas hacer?' : '¿Cerrar sesión?',
    text: hasMultipleRoles
    ? 'Selecciona si deseas salir del portal o cambiar tu rol de trabajo.'
    : '¿Estás seguro que deseas salir del portal?',
    icon: 'question',
    showCancelButton: true,
    showDenyButton: hasMultipleRoles,
    confirmButtonText: 'Sí, salir',
    denyButtonText: 'Cambiar de Rol',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#00B8A9',
    denyButtonColor: '#0F2D4A',
    cancelButtonColor: '#1B254B'
    });

    if (result.isConfirmed) {
    this.authService.logout();
    await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
    } else if (result.isDenied) {
    await this.router.navigateByUrl('/auth/role-selector');
    }
    } finally {
    this.isLeaving.set(false);
    }
    }
    }