import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { catchError, finalize, of, switchMap, timer } from 'rxjs';
import { errorMessages } from '../core/api-error';
import { ClaimsApi } from '../core/claims-api';
import { Policy } from '../core/contracts';
import { Feedback } from './feedback';

@Component({
  selector: 'app-policy-search',
  imports: [Feedback, ReactiveFormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field class="full" [subscriptSizing]="serverError() ? 'dynamic' : 'fixed'">
      <mat-label>Policy number or client name</mat-label>
      <input matInput [formControl]="query" [matAutocomplete]="menu" [errorStateMatcher]="serverErrorMatcher" maxlength="255">
      <mat-autocomplete #menu="matAutocomplete" [displayWith]="display">
        @for (policy of results(); track policy.policyId) {
          <mat-option [value]="policy">{{ policy.policyNumber }} · {{ policy.clientName }}</mat-option>
        }
        @if (searched() && !results().length && !errors().length) {
          <mat-option disabled>No policies found</mat-option>
        }
      </mat-autocomplete>
      <mat-error>{{ serverError() }}</mat-error>
    </mat-form-field>
    <app-feedback [loading]="loading()" [errors]="errors()" />
  `,
})
export class PolicySearch {
  readonly serverError = input('');
  protected readonly serverErrorMatcher: ErrorStateMatcher = { isErrorState: () => !!this.serverError() };
  readonly selection = output<Policy | null>();
  protected readonly query = new FormControl<Policy | string>('', { nonNullable: true });
  protected readonly results = signal<Policy[]>([]);
  protected readonly loading = signal(false);
  protected readonly searched = signal(false);
  protected readonly errors = signal<string[]>([]);
  private readonly api = inject(ClaimsApi);

  constructor() {
    this.query.valueChanges.pipe(
      switchMap(value => {
        this.results.set([]);
        this.searched.set(false);
        this.errors.set([]);
        this.selection.emit(typeof value === 'string' ? null : value);
        if (typeof value !== 'string' || value.trim().length < 2) return of([]);
        this.loading.set(true);
        return timer(250).pipe(
          switchMap(() => this.api.policies(value.trim())),
          catchError(error => {
            this.errors.set(errorMessages(error));
            return of([]);
          }),
          finalize(() => {
            this.loading.set(false);
            this.searched.set(true);
          }),
        );
      }),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(results => this.results.set(results));
  }

  protected readonly display = (value: Policy | string): string =>
    typeof value === 'string' ? value : value.policyNumber + ' · ' + value.clientName;
}
