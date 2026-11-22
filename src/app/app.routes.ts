
import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Session } from './core/session';

const requireSession: CanActivateFn = (_, state) =>
  inject(Session).identity() !== null || inject(Router).createUrlTree(['/login'], { queryParams: { returnTo: state.url } });

export const routes: Routes = [
  { path: 'login', title: 'Sign in · Claims Module', loadComponent: () => import('./features/login').then(m => m.Login) },
  { path: 'claims', canActivateChild: [requireSession], children: [
    { path: '', title: 'Claims · Claims Module', loadComponent: () => import('./features/claims-list').then(m => m.ClaimsList) },
    { path: 'new', title: 'Log new claim · Claims Module', loadComponent: () => import('./features/fnol').then(m => m.Fnol) },
    { path: ':id', title: 'Claim detail · Claims Module', loadComponent: () => import('./features/detail/claim-detail').then(m => m.ClaimDetailPage) },
  ] },
  { path: '', pathMatch: 'full', redirectTo: 'claims' },
  { path: '**', redirectTo: 'claims' },
];
