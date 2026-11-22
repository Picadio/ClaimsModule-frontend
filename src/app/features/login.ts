
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, switchMap, throwError } from 'rxjs';
import { ClaimsApi } from '../core/claims-api';
import { Session } from '../core/session';
import { Feedback } from '../shared/feedback';
import { Operation } from '../shared/operation';

@Component({
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, Feedback],
  template: `
    <section class="login panel">
      <h1>Sign in</h1>
      <p>Use your demo account to access claims.</p>
      <app-feedback [loading]="operation.pending()" [errors]="operation.errors()" />
      <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
        <mat-form-field>
          <mat-label>Username</mat-label>
          <input matInput formControlName="username" autocomplete="username" maxlength="64" required>
          <mat-error>Enter your username.</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Password</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="current-password" maxlength="256" required>
          <mat-error>Enter your password.</mat-error>
        </mat-form-field>
        <button mat-flat-button [disabled]="operation.pending()">Sign in</button>
      </form>
    </section>
  `,
})
export class Login {
  protected readonly operation = new Operation();
  protected readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(256)]],
  });
  private readonly api = inject(ClaimsApi);
  private readonly session = inject(Session);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected submit(): void {
    if (this.form.invalid || this.operation.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    const credentials = this.form.getRawValue();
    credentials.username = credentials.username.trim();
    this.operation.run(this.api.login(credentials).pipe(
      switchMap(token => {
        this.session.start(token.accessToken);
        return this.api.me();
      }),
      map(identity => this.session.identify(identity, credentials.username)),
      catchError(error => {
        this.session.end();
        return throwError(() => error);
      }),
    ), () => {
      this.form.reset();
      const destination = this.route.snapshot.queryParamMap.get('returnTo') ?? '';
      void this.router.navigateByUrl(/^\/claims(?:\/|\?|$)/.test(destination) ? destination : '/claims');
    });
  }
}
