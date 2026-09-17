import { SwalComponent, SwalPortalDirective, SwalPortalTargets } from '@sweetalert2/ngx-sweetalert2';
import { BodegaComponent } from '../bodega/bodega.component';
import { NominaComponent } from '../nomina/nomina.component';
import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

interface DashboardCard {
    title: string;
    description: string;
    icon: string;
    className: string;
    route: string | null;
    action?: 'bodega' | 'nomina';
}

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [RouterLink, SwalComponent, SwalPortalDirective, BodegaComponent, NominaComponent],
    templateUrl: './admin-dashboard.component.html',
    styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent {
    readonly swalTargets = inject(SwalPortalTargets);
    private readonly bodegaModal = viewChild.required<SwalComponent>('bodegaModal');
    private readonly nominaModal = viewChild.required<SwalComponent>('nominaModal');
    openReport(action: 'bodega' | 'nomina' | undefined): void {
        if (action === 'bodega') void this.bodegaModal().fire();
        if (action === 'nomina') void this.nominaModal().fire();
    }

    readonly cards: readonly DashboardCard[] = [
        {
            title: 'Gestión de Usuarios',
            description: 'Administra empleados, jefes y roles.',
            icon: 'fa-solid fa-users',
            className: 'card card-blue',
            route: '/admin/usuarios'
        },
        {
            title: 'Trabajos y Proyectos',
            description: 'Asignación de obras y seguimiento.',
            icon: 'fa-solid fa-hammer',
            className: 'card card-purple',
            route: '/admin/trabajos'
        },
        {
            title: 'Evidencias',
            description: 'Revisión visual de los avances de obra.',
            icon: 'fa-solid fa-camera',
            className: 'card card-blue',
            route: '/admin/evidencias'
        },
        {
            title: 'Categorías',
            description: 'Clasificación de materiales y servicios.',
            icon: 'fa-solid fa-tags',
            className: 'card card-orange',
            route: '/admin/categorias'
        },
        {
            title: 'Materiales',
            description: 'Control de Materiales e Inventario.',
            icon: 'fa-solid fa-boxes-stacked',
            className: 'card card-green',
            route: '/admin/materiales'
        },
        {
            title: 'Resumen de Bodega Global',
            description: 'Materiales y estado de todos los proyectos por día',
            icon: 'fa-solid fa-truck-fast',
            className: 'card card-orange',
            route: '/admin/bodega'
        },
        {
            title: 'Nómina Quincenal Global',
            description: 'Pagos completados de todo el personal',
            icon: 'fa-solid fa-money-check-dollar',
            className: 'card card-green',
            route: '/admin/nomina'
        },
        {
            title: 'Clientes frecuentes',
            description: 'Gestión de clientes frecuentes',
            icon: 'fa-solid fa-address-book',
            className: 'card card-blue',
            route: '/admin/clientes-frecuentes'
        }
    ];
}
