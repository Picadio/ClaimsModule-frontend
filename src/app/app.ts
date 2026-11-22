
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Session } from './core/session';

@Component({
  selector: 'app-root',
  imports: [MatButtonModule, RouterLink, RouterOutlet],
  template: `
    <header class="site-header">
      <div class="site-header-inner">
        <a class="site-name" routerLink="/claims">Claims Module</a>
        @if (session.identity(); as user) {
          <span class="session">{{ user.username }} <strong>{{ user.role }}</strong></span>
          <button mat-button type="button" (click)="signOut()">Sign out</button>
        }
      </div>
    </header>
    <main><router-outlet /></main>
  `,
})
export class App {
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  protected signOut(): void {
    const returnTo = this.router.url;
    this.session.end();
    void this.router.navigate(['/login'], { queryParams: { returnTo } });
  }
}
