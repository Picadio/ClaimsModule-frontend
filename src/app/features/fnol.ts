import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { Router, RouterLink } from '@angular/router';
import { catchError, EMPTY, of, Subject, switchMap, throwError } from 'rxjs';
import { ApiError } from '../core/api-error';
import { ClaimsApi } from '../core/claims-api';
import {
  assetTypes, AssetType, Cause, components, CreateClaim, PartyInput, Policy,
  ReserveComponent, RiskInput, severities, Severity,
} from '../core/contracts';
import { MoneyPipe, moneyText, moneyUnits, reserveAuthority } from '../core/money';
import { policyPeriodBadge } from '../core/policy-period';
import { Confirm } from '../shared/confirm';
import { Feedback } from '../shared/feedback';
import { Operation } from '../shared/operation';
import { PartyForm, partyName } from '../shared/party-form';
import { PolicySearch } from '../shared/policy-search';

function pastDate(control: AbstractControl<string>) {
  const timestamp = new Date(control.value).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now() ? null : { pastDate: true };
}

const partyLabels: Readonly<Record<string, string>> = {
  role: 'Role', partytype: 'Party type', firstname: 'First name', lastname: 'Last name',
  companyname: 'Company name', email: 'Email', phone: 'Phone', notes: 'Party notes',
};

const riskLabels: Readonly<Record<string, string>> = {
  assettype: 'Asset type', assetdescription: 'Asset description', assetreference: 'Asset reference',
  damagedescription: 'Damage description', isprimary: 'Primary asset',
};

function fieldPath(field: string): string {
  const path = field.toLowerCase().replace(/^(?:\$(?:\.)?|request\.)+/, '');
  return path === 'amount' || path === 'component' ? 'initialreserve.' + path : path;
}

function issueStep(path: string): number {
  if (/^(lossevent|policyid|claimtype|severity)\b/.test(path)) return 0;
  if (/^(parties|riskobjects)\b/.test(path)) return 1;
  return 2;
}

@Component({
  imports: [
    DatePipe, RouterLink, ReactiveFormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatStepperModule, PolicySearch, Feedback, PartyForm, MoneyPipe,
  ],
  templateUrl: './fnol.html',
})
export class Fnol {
  private readonly api = inject(ClaimsApi);
  private readonly router = inject(Router);
  private readonly dialogs = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly reference = new Operation();
  protected readonly submission = new Operation();
  private readonly serverIssues = signal<Record<string, string[]>>({});
  protected readonly fieldIssues = computed(() => {
    const steps: string[][] = [[], [], []];
    for (const [field, messages] of Object.entries(this.serverIssues())) {
      steps[issueStep(field)].push(...messages);
    }
    return steps;
  });
  private readonly controlPaths = new Map<AbstractControl, string>();
  private readonly defaultMatcher = inject(ErrorStateMatcher);
  private revision = 0;
  protected readonly serverErrorMatcher: ErrorStateMatcher = {
    isErrorState: (control, form) => {
      const path = control && this.controlPaths.get(control);
      return !!(path && this.fieldError(path)) || this.defaultMatcher.isErrorState(control, form);
    },
  };
  private readonly stepper = viewChild(MatStepper);
  protected readonly causes = signal<Cause[]>([]);
  protected readonly policy = signal<Policy | null>(null);
  protected readonly coverage = signal<string[]>([]);
  protected readonly loadingCoverage = signal(false);
  private readonly selectedPolicies = new Subject<Policy | null>();
  protected readonly causesQuery = new FormControl('', { nonNullable: true });
  protected readonly parties = signal<PartyInput[]>([]);
  protected readonly risks = signal<RiskInput[]>([]);
  protected readonly editingParty = signal(false);
  protected readonly editingRisk = signal(false);
  protected readonly triedParties = signal(false);
  protected readonly partyName = partyName;
  protected readonly severities = severities;
  protected readonly assetTypes = assetTypes;
  protected readonly components = components;
  protected readonly details = this.fb.group({
    policyReady: [false, Validators.requiredTrue],
    unknown: [false],
    claimType: ['Property', [(control: AbstractControl<string>) => control.value.trim() ? null : { required: true }, Validators.maxLength(50)]],
    severity: ['Standard' as Severity],
    lossDate: ['', [Validators.required, pastDate]],
    causeOfLossCode: ['', Validators.required],
    lossDescription: ['', (control: AbstractControl<string>) => control.value.trim().length >= 20 ? null : { minlength: true }],
    lossLocation: ['', Validators.maxLength(500)],
    estimatedLossAmount: ['', (control: AbstractControl<string>) => {
      if (!control.value.trim()) return null;
      const amount = moneyUnits(control.value);
      return amount !== null && amount >= 0n ? null : { amount: true };
    }],
    policeReportNumber: ['', Validators.maxLength(100)],
  });
  protected readonly claimantReady = new FormControl(false, { nonNullable: true, validators: Validators.requiredTrue });
  protected readonly riskForm = this.fb.group({
    assetType: ['Property' as AssetType],
    assetDescription: ['', (control: AbstractControl<string>) => control.value.trim() ? null : { required: true }],
    damageDescription: [''],
    assetReference: [''],
    isPrimary: [false],
  });
  protected readonly reserve = this.fb.group({
    component: ['Indemnity' as ReserveComponent],
    amount: [''],
  });

  constructor() {
    this.refreshCauses();
    const destroyRef = inject(DestroyRef);
    for (const [name, control] of Object.entries(this.details.controls)) {
      if (name === 'unknown' || name === 'policyReady') continue;
      const field = name === 'claimType' || name === 'severity' ? name : 'LossEvent.' + name;
      this.watchControl(control, field, destroyRef);
    }
    for (const [name, control] of Object.entries(this.reserve.controls)) {
      this.watchControl(control, 'InitialReserve.' + name, destroyRef);
    }
    this.details.controls.unknown.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(unknown => {
      this.clearIssues('policyid');
      this.clearIssues('initialreserve', true);
      if (unknown) {
        this.selectPolicy(null);
        this.reserve.reset();
      }
      this.details.controls.policyReady.setValue(unknown || this.policy() !== null);
    });
    this.selectedPolicies.pipe(
      switchMap(policy => {
        this.coverage.set(policy?.coverageTypes ?? []);
        this.loadingCoverage.set(!!policy);
        return policy ? this.api.coverage(policy.policyId).pipe(catchError(() => of(null))) : of(null);
      }),
      takeUntilDestroyed(destroyRef),
    ).subscribe(result => {
      if (result) this.coverage.set(result.coverageTypes);
      this.loadingCoverage.set(false);
    });
  }

  protected refreshCauses(): void {
    this.reference.run(this.api.causes(), causes => this.causes.set(causes));
  }

  protected filteredCauses(): Cause[] {
    const search = this.causesQuery.value.trim().toLowerCase();
    const selected = this.details.controls.causeOfLossCode.value;
    return this.causes().filter(cause =>
      cause.code === selected || (cause.name + ' ' + cause.code).toLowerCase().includes(search));
  }

  protected selectPolicy(policy: Policy | null): void {
    this.clearIssues('policyid');
    this.clearIssues('initialreserve', true);
    this.policy.set(policy);
    this.details.controls.policyReady.setValue(this.details.controls.unknown.value || policy !== null);
    this.selectedPolicies.next(policy);
  }

  protected period(policy: Policy) {
    return policyPeriodBadge(this.details.controls.lossDate.value, policy);
  }

  protected updateParties(parties: PartyInput[]): void {
    this.clearIssues('parties', true);
    this.parties.set(parties);
    this.claimantReady.setValue(parties.some(party => party.role === 'Claimant'));
    this.editingParty.set(false);
  }

  protected openRisk(): void {
    this.riskForm.reset();
    this.editingRisk.set(true);
  }

  protected addRisk(): void {
    if (this.riskForm.invalid) {
      this.riskForm.markAllAsTouched();
      return;
    }
    const form = this.riskForm.getRawValue();
    this.updateRisks([...this.risks(), {
      assetType: form.assetType, assetDescription: form.assetDescription.trim(),
      damageDescription: form.damageDescription.trim() || null,
      assetReference: form.assetReference.trim() || null, isPrimary: form.isPrimary,
    }]);
    this.editingRisk.set(false);
  }

  protected updateRisks(risks: RiskInput[]): void {
    this.clearIssues('riskobjects', true);
    this.risks.set(risks);
  }

  protected fieldError(field: string): string {
    return this.serverIssues()[fieldPath(field)]?.join(' ') ?? '';
  }

  protected rowErrors(collection: 'parties' | 'riskobjects', index: number): string[] {
    const prefix = collection + '[' + index + '].';
    const labels = collection === 'parties' ? partyLabels : riskLabels;
    return Object.entries(this.serverIssues()).flatMap(([field, messages]) => {
      const name = field.slice(prefix.length);
      return field.startsWith(prefix) && Object.hasOwn(labels, name)
        ? messages.map(message => labels[name] + ': ' + message)
        : [];
    });
  }

  private watchControl(control: AbstractControl, field: string, destroyRef: DestroyRef): void {
    const path = fieldPath(field);
    this.controlPaths.set(control, path);
    control.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      this.clearIssues(path);
      if (path.startsWith('lossevent.')) this.clearIssues('lossevent');
      if (path.startsWith('initialreserve.')) this.clearIssues('initialreserve');
      if (path === 'initialreserve.component') this.clearIssues('initialreserve.amount');
    });
  }

  private clearIssues(field: string, descendants = false): void {
    this.revision++;
    this.serverIssues.update(issues => Object.fromEntries(Object.entries(issues).filter(([path]) =>
      path !== field && !(descendants && (path.startsWith(field + '.') || path.startsWith(field + '['))),
    )));
  }

  protected reserveHint(): string {
    const raw = this.reserve.controls.amount.value;
    if (!raw.trim()) return '';
    const amount = moneyUnits(raw);
    if (amount === null || amount === 0n) return 'Enter a nonzero amount with up to four decimal places.';
    const recoverable = this.reserve.controls.component.value === 'SubrogationRecoverable';
    if (recoverable ? amount > 0n : amount < 0n) {
      return recoverable ? 'Enter a negative recoverable amount.' : 'Enter a positive amount.';
    }
    switch (reserveAuthority(amount)) {
      case 'Automatic': return 'Auto-approved';
      case 'Supervisor': return 'Supervisor approval required';
      case 'Manager': return 'Manager approval required';
    }
  }

  protected reserveInvalid(): boolean {
    const raw = this.reserve.controls.amount.value;
    if (!this.policy() || !raw.trim()) return false;
    const units = moneyUnits(raw);
    return units === null || units === 0n ||
      (this.reserve.controls.component.value === 'SubrogationRecoverable' ? units > 0n : units < 0n);
  }

  protected submit(): void {
    if (this.details.invalid || this.claimantReady.invalid || this.reserveInvalid() || this.submission.pending()) {
      this.details.markAllAsTouched();
      this.triedParties.set(true);
      return;
    }
    this.serverIssues.set({});
    const submittedRevision = this.revision;
    const form = this.details.getRawValue();
    const reserve = this.reserve.getRawValue();
    const amount = moneyUnits(reserve.amount);
    const estimated = moneyUnits(form.estimatedLossAmount);
    const request: CreateClaim = {
      policyId: this.policy()?.policyId ?? null,
      claimType: form.claimType.trim(),
      severity: form.severity,
      lossEvent: {
        lossDate: new Date(form.lossDate).toISOString(),
        causeOfLossCode: form.causeOfLossCode,
        lossDescription: form.lossDescription.trim(),
        lossLocation: form.lossLocation.trim() || null,
        estimatedLossAmount: estimated === null ? null : moneyText(estimated),
        policeReportNumber: form.policeReportNumber.trim() || null,
      },
      parties: this.parties(),
      riskObjects: this.risks(),
      initialReserve: this.policy() && amount !== null ? { component: reserve.component, amount: moneyText(amount) } : null,
    };

    this.submission.run(this.api.validate(request).pipe(
      switchMap(validation => {
        if (submittedRevision !== this.revision) return this.changedDuringSubmission();
        return validation.warnings.length
          ? this.dialogs.open(Confirm, { data: {
            title: 'Create claim with warnings?',
            messages: validation.warnings.map(warning => warning.message),
            action: 'Create claim',
          } }).afterClosed()
          : of(true);
      }),
      switchMap(confirmed => {
        if (!confirmed) return EMPTY;
        return submittedRevision === this.revision ? this.api.create(request) : this.changedDuringSubmission();
      }),
    ), created => {
      this.snackbar.open('Claim ' + created.claimNumber + ' was created.', 'Dismiss', { duration: 6000 });
      void this.router.navigate(['/claims', created.id], { state: { created: created.claimNumber } });
    }, error => this.showFieldErrors(error, submittedRevision));
  }

  private changedDuringSubmission() {
    return throwError(() => new Error('The form changed during submission. Review your changes and try again.'));
  }

  private showFieldErrors(error: unknown, submittedRevision: number): void {
    if (!(error instanceof ApiError) || error.status !== 422) return;
    if (submittedRevision !== this.revision) {
      this.submission.errors.set(['The form changed during submission. Review your changes and try again.']);
      return;
    }

    const issues: Record<string, string[]> = Object.create(null);
    for (const [field, messages] of Object.entries(error.fields)) {
      if (!messages.length) continue;
      const path = fieldPath(field);
      issues[path] = [...(issues[path] ?? []), ...messages];
    }
    if (!Object.keys(issues).length) return;
    this.serverIssues.set(issues);
    this.submission.errors.set([]);
    const first = this.fieldIssues().findIndex(messages => messages.length > 0);
    const stepper = this.stepper();
    if (first !== -1 && stepper) stepper.selectedIndex = first;
  }
}
