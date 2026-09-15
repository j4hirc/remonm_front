import {
  SwalComponent,
  SwalPortalDirective,
  SwalPortalTargets
} from '@sweetalert2/ngx-sweetalert2';
import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BodegaComponent } from '../../admin/bodega/bodega.component';
import { NominaComponent } from '../../admin/nomina/nomina.component';
import { BodegaJefeComponent } from '../bodega/bodega.component';
import { NominaJefeComponent } from '../nomina/nomina.component';


interface DashboardCard {
  title: string;
  description: string;
  icon: string;
  className: string;
  route: string | null;
  action?: 'bodega' | 'nomina';
}

@Component({
  selector: 'app-jefe-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    SwalComponent,
    SwalPortalDirective,
    BodegaJefeComponent,
    NominaJefeComponent
  ],
  templateUrl: './jefe-dashboard.component.html',
  styleUrl: './jefe-dashboard.component.css'
})
export class JefeDashboardComponent {
  readonly swalTargets = inject(SwalPortalTargets);
  private readonly bodegaModal =
    viewChild.required<SwalComponent>('bodegaModal');
  private readonly nominaModal =
    viewChild.required<SwalComponent>('nominaModal');

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
      route: '/jefe/usuarios'
    },
    {
      title: 'Trabajos y Proyectos',
      description: 'Asignación de obras y seguimiento.',
      icon: 'fa-solid fa-hammer',
      className: 'card card-purple',
      route: '/jefe/trabajos'
    },
    {
      title: 'Evidencias',
      description: 'Revisión visual de los avances de obra.',
      icon: 'fa-solid fa-camera',
      className: 'card card-blue',
      route: '/jefe/evidencias'
    },
    {
      title: 'Categorías',
      description: 'Clasificación de materiales y servicios.',
      icon: 'fa-solid fa-tags',
      className: 'card card-orange',
      route: '/jefe/categorias'
    },
    {
      title: 'Materiales',
      description: 'Control de Materiales e Inventario.',
      icon: 'fa-solid fa-boxes-stacked',
      className: 'card card-green',
      route: '/jefe/materiales'
    },
    {
      title: 'Resumen de Bodega Global',
      description: 'Materiales y estado de todos los proyectos por día',
      icon: 'fa-solid fa-truck-fast',
      className: 'card card-orange',
      route: '/jefe/bodega'
    },
    {
      title: 'Nómina Quincenal Global',
      description: 'Pagos completados de todo el personal',
      icon: 'fa-solid fa-money-check-dollar',
      className: 'card card-green',
      route: '/jefe/nomina'
    },
    {
      title: 'Calendario',
      description: 'Cronograma de todas las obras',
      icon: 'fa-solid fa-calendar-days',
      className: 'card card-purple',
      route: '/jefe/calendario'
    }
  ];
}