import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface DashboardCard {
    title: string;
    description: string;
    icon: string;
    className: string;
    route: string | null;
}

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './admin-dashboard.component.html',
    styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent {
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
            route: null
        },
        {
            title: 'Nómina Quincenal Global',
            description: 'Pagos completados de todo el personal',
            icon: 'fa-solid fa-money-check-dollar',
            className: 'card card-green',
            route: null
        }
    ];
}