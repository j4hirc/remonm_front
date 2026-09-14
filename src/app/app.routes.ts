import { Routes } from '@angular/router';

import { authGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'auth/login',
        loadComponent: () =>
            import('./auth/login/login.component').then(
                (component) => component.LoginComponent
            )
    },
    {
        path: 'auth/role-selector',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./auth/role-selector/role-selector.component').then(
                (component) => component.RoleSelectorComponent
            )
    },
    {
        path: 'admin',
        canActivate: [roleGuard],
        data: { role: 'ROLE_ADMIN' },
        loadComponent: () =>
            import('./admin/layout/admin-layout.component').then(
                (component) => component.AdminLayoutComponent
            ),
        children: [
            {
                path: 'dashboard',
                canActivate: [roleGuard],
                data: {
                    role: 'ROLE_ADMIN',
                    heading: 'Resumen del Sistema'
                },
                loadComponent: () =>
                    import('./admin/dashboard/admin-dashboard.component').then(
                        (component) => component.AdminDashboardComponent
                    )
            },
            {
                path: 'categorias',
                canActivate: [roleGuard],
                data: {
                    role: 'ROLE_ADMIN',
                    heading: 'Gestión de Categorías'
                },
                loadComponent: () =>
                    import('./admin/categorias/categorias.component').then(
                        (component) => component.CategoriasComponent
                    )
            },

            {
                path: 'materiales',
                canActivate: [roleGuard],
                data: {
                    role: 'ROLE_ADMIN',
                    heading: 'Gestión de Materiales'
                },
                loadComponent: () =>
                    import('./admin/materiales/materiales.component').then(
                        (component) => component.MaterialesComponent
                    )
            },
            {
                path: 'usuarios',
                canActivate: [roleGuard],
                data: {
                    role: 'ROLE_ADMIN',
                    heading: 'Gestión de Usuarios'
                },
                loadComponent: () =>
                    import('./admin/usuarios/usuarios.component').then(
                        (component) => component.UsuariosComponent
                    )
            },
            {
                path: 'trabajos',
                canActivate: [roleGuard],
                data: {
                    role: 'ROLE_ADMIN',
                    heading: 'Gestión de Trabajos'
                },
                loadComponent: () =>
                    import('./admin/trabajos/trabajos.component').then(
                        (component) => component.TrabajosComponent
                    )
            },
            {
                path: 'evidencias',
                canActivate: [roleGuard],
                data: {
                    role: 'ROLE_ADMIN',
                    heading: 'Evidencias'
                },
                loadComponent: () =>
                    import('./admin/evidencias/evidencias.component').then(
                        (c) => c.EvidenciasComponent
                    )
            },
            {
                path: 'bodega',
                canActivate: [roleGuard],
                data: {
                    role: 'ROLE_ADMIN',
                    heading: 'Resumen de Bodega Global'
                },
                loadComponent: () =>
                    import('./admin/bodega/bodega.component').then(
                        (component) => component.BodegaComponent
                    )
            },
            {
                path: 'nomina',
                canActivate: [roleGuard],
                data: {
                    role: 'ROLE_ADMIN',
                    heading: 'Nómina Quincenal Global'
                },
                loadComponent: () =>
                    import('./admin/nomina/nomina.component').then(
                        (component) => component.NominaComponent
                    )
            },
            {
                path: '',
                redirectTo: 'dashboard',
                pathMatch: 'full'
            }


        ]
    },
    {
        path: 'jefe/dashboard',
        canActivate: [roleGuard],
        data: { role: 'ROLE_JEFE' },
        loadComponent: () =>
            import(
                './shared/components/session-preview/session-preview.component'
            ).then((component) => component.SessionPreviewComponent)
    },
    {
        path: 'employee/dashboard',
        canActivate: [roleGuard],
        data: { role: 'ROLE_EMPLOYEE' },
        loadComponent: () =>
            import(
                './shared/components/session-preview/session-preview.component'
            ).then((component) => component.SessionPreviewComponent)
    },
    {
        path: '',
        redirectTo: 'auth/login',
        pathMatch: 'full'
    },
    {
        path: '**',
        redirectTo: 'auth/login'
    }
];