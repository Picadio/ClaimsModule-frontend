import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ClaimsApi } from '../core/claims-api';
import { Role } from '../core/contracts';
import { Feedback } from '../shared/feedback';
import { Operation } from '../shared/operation';

@Component({
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, Feedback],
  template: `
    <section class="login panel">
      <h1>Create a demo account</h1>
      <app-feedback [loading]="operation.pending()" [errors]="operation.errors()" />
      <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
        <mat-form-field>
          <mat-label>Username</mat-label>
          <input matInput formControlName="username" autocomplete="username" maxlength="64" required>
          <mat-error>Use only letters A-Z, digits, dots, underscores or hyphens.</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Password</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="new-password" maxlength="256" required>
          <mat-error>Use 8 to 256 characters.</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Role</mat-label>
          <mat-select formControlName="role" required>
            <mat-option value="handler">Handler</mat-option>
            <mat-option value="supervisor">Supervisor</mat-option>
            <mat-option value="manager">Manager</mat-option>
          </mat-select>
          <mat-error>Select a role.</mat-error>
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="operation.pending()">Register</button>
        <a mat-button routerLink="/login">Back to sign in</a>
      </form>
    </section>
  `,
})
export class Register {
  protected readonly operation = new Operation();
  protected readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9._-]{1,64}$/)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(256)]],
    role: ['' as Role | '', Validators.required],
  });
  private readonly api = inject(ClaimsApi);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private key: string | undefined;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.key = undefined);
  }

  protected submit(): void {
    if (this.operation.pending()) return;
    const request = this.form.getRawValue();
    if (this.form.invalid || !request.role) {
      this.form.markAllAsTouched();
      return;
    }

    this.key ??= crypto.randomUUID();
    this.form.disable({ emitEvent: false });
    this.operation.run(this.api.register({ ...request, role: request.role }, this.key)
      .pipe(finalize(() => this.form.enable({ emitEvent: false }))), () => {
      this.form.reset();
      this.snackbar.open('Demo account created. Sign in to continue.', 'Dismiss', { duration: 5000 });
      void this.router.navigate(['/login']);
    });
  }
}
