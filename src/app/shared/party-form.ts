
import { Component, DestroyRef, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { PartyInput, PartyRole, PartyType, roles, partyTypes } from '../core/contracts';

@Component({
  selector: 'app-party-form',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <form class="panel" [formGroup]="form" (ngSubmit)="submit()">
      <h3>Add party</h3>
      <div class="fields">
        <mat-form-field><mat-label>Role</mat-label><mat-select formControlName="role">
          @for (role of roles; track role) { <mat-option [value]="role">{{ role }}</mat-option> }
        </mat-select></mat-form-field>
        <mat-form-field><mat-label>Party type</mat-label><mat-select formControlName="partyType">
          @for (type of types; track type) { <mat-option [value]="type">{{ type }}</mat-option> }
        </mat-select></mat-form-field>
        @if (form.controls.partyType.value === 'Person') {
          <mat-form-field><mat-label>First name</mat-label>
            <input matInput formControlName="firstName" maxlength="100" required>
            <mat-error>Enter a first name.</mat-error>
          </mat-form-field>
          <mat-form-field><mat-label>Last name</mat-label>
            <input matInput formControlName="lastName" maxlength="100" required>
            <mat-error>Enter a last name.</mat-error>
          </mat-form-field>
        } @else {
          <mat-form-field><mat-label>Company name</mat-label>
            <input matInput formControlName="companyName" maxlength="255" required>
            <mat-error>Enter a company name.</mat-error>
          </mat-form-field>
        }
        <mat-form-field><mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" maxlength="255">
          <mat-error>Enter a valid email address.</mat-error>
        </mat-form-field>
        <mat-form-field><mat-label>Phone</mat-label><input matInput formControlName="phone" maxlength="50"></mat-form-field>
      </div>
      <mat-form-field class="full"><mat-label>Party notes</mat-label><textarea matInput formControlName="notes"></textarea></mat-form-field>
      <div class="actions">
        <button mat-button type="button" [disabled]="busy()" (click)="cancelled.emit()">Cancel</button>
        <button mat-flat-button [disabled]="busy()">Add party</button>
      </div>
    </form>
  `,
})
export class PartyForm {
  readonly busy = input(false);
  readonly saved = output<PartyInput>();
  readonly cancelled = output<void>();
  protected readonly roles = roles;
  protected readonly types = partyTypes;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    role: ['Claimant' as PartyRole],
    partyType: ['Person' as PartyType],
    firstName: ['', trimmedName], lastName: ['', trimmedName], companyName: ['', trimmedName],
    email: ['', Validators.email], phone: [''], notes: [''],
  });

  constructor() {
    this.form.controls.companyName.disable();
    this.form.controls.partyType.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(type => {
      const { firstName, lastName, companyName } = this.form.controls;
      if (type === 'Person') {
        firstName.enable();
        lastName.enable();
        companyName.disable();
      } else {
        firstName.disable();
        lastName.disable();
        companyName.enable();
      }
    });
  }
  protected submit(): void {
    const value = this.form.getRawValue();
    const isPerson = value.partyType === 'Person';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saved.emit({
      role: value.role, partyType: value.partyType,
      ...isPerson ? { firstName: value.firstName.trim(), lastName: value.lastName.trim(), companyName: null }
        : { firstName: null, lastName: null, companyName: value.companyName.trim() },
      email: value.email.trim() || null, phone: value.phone.trim() || null, notes: value.notes.trim() || null,
    });
  }
}

function trimmedName(control: AbstractControl<string>) {
  return control.value.trim() ? null : { required: true };
}

export function partyName(party: PartyInput): string {
  return party.companyName || [party.firstName, party.lastName].filter(Boolean).join(' ');
}

