import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'auth/login',
        loadComponent: () =>
            import('./auth/login/login.component').then((c) => c.LoginComponent)
    },
    {
        path: 'auth/role-selector',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./auth/role-selector/role-selector.component').then(
                (c) => c.RoleSelectorComponent
            )
    },
    {
        path: 'admin',
        canActivate: [roleGuard],
        data: { role: 'ROLE_ADMIN' },
        loadComponent: () =>
            import('./admin/layout/admin-layout.component').then(
                (c) => c.AdminLayoutComponent
            ),
        children: [
            {
                path: 'dashboard',
                canActivate: [roleGuard],
                data: { role: 'ROLE_ADMIN', heading: 'Resumen del Sistema' },
                loadComponent: () =>
                    import('./admin/dashboard/admin-dashboard.component').then(
                        (c) => c.AdminDashboardComponent
                    )
            },
            {
                path: 'categorias',
                canActivate: [roleGuard],
                data: { role: 'ROLE_ADMIN', heading: 'Gestión de Categorías' },
                loadComponent: () =>
                    import('./admin/categorias/categorias.component').then(
                        (c) => c.CategoriasComponent
                    )
            },
            {
                path: 'materiales',
                canActivate: [roleGuard],
                data: { role: 'ROLE_ADMIN', heading: 'Gestión de Materiales' },
                loadComponent: () =>
                    import('./admin/materiales/materiales.component').then(
                        (c) => c.MaterialesComponent
                    )
            },
            {
                path: 'usuarios',
                canActivate: [roleGuard],
                data: { role: 'ROLE_ADMIN', heading: 'Gestión de Usuarios' },
                loadComponent: () =>
                    import('./admin/usuarios/usuarios.component').then(
                        (c) => c.UsuariosComponent
                    )
            },
            {
                path: 'trabajos',
                canActivate: [roleGuard],
                data: { role: 'ROLE_ADMIN', heading: 'Gestión de Trabajos' },
                loadComponent: () =>
                    import('./admin/trabajos/trabajos.component').then(
                        (c) => c.TrabajosComponent
                    )
            },
            {
                path: 'evidencias',
                canActivate: [roleGuard],
                data: { role: 'ROLE_ADMIN', heading: 'Evidencias' },
                loadComponent: () =>
                    import('./admin/evidencias/evidencias.component').then(
                        (c) => c.EvidenciasComponent
                    )
            },
            {
                path: 'bodega',
                canActivate: [roleGuard],
                data: { role: 'ROLE_ADMIN', heading: 'Resumen de Bodega Global' },
                loadComponent: () =>
                    import('./admin/bodega/bodega.component').then(
                        (c) => c.BodegaComponent
                    )
            },
            {
                path: 'nomina',
                canActivate: [roleGuard],
                data: { role: 'ROLE_ADMIN', heading: 'Nómina Quincenal Global' },
                loadComponent: () =>
                    import('./admin/nomina/nomina.component').then(
                        (c) => c.NominaComponent
                    )
            },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
        ]
    },
    {
        path: 'jefe',
        canActivate: [roleGuard],
        data: { role: 'ROLE_JEFE' },
        loadComponent: () =>
            import('./jefe/layout/jefe-layout.component').then(
                (c) => c.JefeLayoutComponent
            ),
        children: [
            {
                path: 'dashboard',
                canActivate: [roleGuard],
                data: { role: 'ROLE_JEFE', heading: 'Resumen de Operaciones' },
                loadComponent: () =>
                    import('./jefe/dashboard/jefe-dashboard.component').then(
                        (c) => c.JefeDashboardComponent
                    )
            },
            {
                path: 'usuarios',
                canActivate: [roleGuard],
                data: { role: 'ROLE_JEFE', heading: 'Gestión de Usuarios' },
                loadComponent: () =>
                    import('./jefe/usuarios/usuarios.component').then(
                        (c) => c.UsuariosJefeComponent
                    )
            },
            {
                path: 'trabajos',
                canActivate: [roleGuard],
                data: { role: 'ROLE_JEFE', heading: 'Gestión de Trabajos' },
                loadComponent: () =>
                    import('./jefe/trabajos/trabajos.component').then(
                        (c) => c.TrabajosJefeComponent
                    )
            },
            {
                path: 'evidencias',
                canActivate: [roleGuard],
                data: { role: 'ROLE_JEFE', heading: 'Evidencias' },
                loadComponent: () =>
                    import('./jefe/evidencias/evidencias.component').then(
                        (c) => c.EvidenciasJefeComponent
                    )
            },
            {
                path: 'bodega',
                canActivate: [roleGuard],
                data: { role: 'ROLE_JEFE', heading: 'Resumen de Bodega Global' },
                loadComponent: () =>
                    import('./jefe/bodega/bodega.component').then(
                        (c) => c.BodegaJefeComponent
                    )
            },
            {
                path: 'nomina',
                canActivate: [roleGuard],
                data: { role: 'ROLE_JEFE', heading: 'Nómina Quincenal Global' },
                loadComponent: () =>
                    import('./jefe/nomina/nomina.component').then(
                        (c) => c.NominaJefeComponent
                    )
            },
            {
                path: 'calendario',
                canActivate: [roleGuard],
                data: { role: 'ROLE_JEFE', heading: 'Calendario de Obras' },
                loadComponent: () =>
                    import('./jefe/calendario/calendario.component').then(
                        (c) => c.CalendarioJefeComponent
                    )
            },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
        ]
    },
    {
        path: 'employee',
        canActivate: [roleGuard],
        data: { role: 'ROLE_EMPLOYEE' },
        loadComponent: () =>
            import('./employee/layout/employee-layout.component').then(
                (c) => c.EmployeeLayoutComponent
            ),
        children: [
            {
                path: 'dashboard',
                canActivate: [roleGuard],
                data: { role: 'ROLE_EMPLOYEE', heading: 'Inicio' },
                loadComponent: () =>
                    import('./employee/dashboard/employee-dashboard.component').then(
                        (c) => c.EmployeeDashboardComponent
                    )
            },
            {
                path: 'calendario',
                canActivate: [roleGuard],
                data: { role: 'ROLE_EMPLOYEE', heading: 'Mi Calendario' },
                loadComponent: () =>
                    import('./employee/calendario/calendario.component').then(
                        (c) => c.CalendarioEmployeeComponent
                    )
            },
            {
                path: 'evidencias',
                canActivate: [roleGuard],
                data: { role: 'ROLE_EMPLOYEE', heading: 'Mis Evidencias' },
                loadComponent: () =>
                    import('./employee/evidencias/evidencias.component').then(
                        (c) => c.EvidenciasEmployeeComponent
                    )
            },
            {
                path: 'reporte',
                canActivate: [roleGuard],
                data: { role: 'ROLE_EMPLOYEE', heading: 'Hacer Reporte' },
                loadComponent: () =>
                    import('./employee/reporte/reporte.component').then(
                        (c) => c.ReporteEmployeeComponent
                    )
            },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
        ]
    },
    { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
    { path: '**', redirectTo: 'auth/login' }
];