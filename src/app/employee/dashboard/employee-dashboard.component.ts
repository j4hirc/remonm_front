import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface DashCard {
  title: string;
  description: string;
  icon: string;
  className: string;
  route: string;
}

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './employee-dashboard.component.html',
  styleUrl: './employee-dashboard.component.css'
})
export class EmployeeDashboardComponent {
  readonly cards: readonly DashCard[] = [
    {
      title: 'Mi Calendario',
      description: 'Consulta tus obras asignadas y abre el reporte.',
      icon: 'fa-solid fa-calendar-days',
      className: 'card card-teal',
      route: '/employee/calendario'
    },
    {
      title: 'Mis Evidencias',
      description: 'Revisa los avances y fotos que ya subiste.',
      icon: 'fa-solid fa-camera',
      className: 'card card-blue',
      route: '/employee/evidencias'
    }
  ];
}