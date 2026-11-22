
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EMPTY, switchMap } from 'rxjs';
import { ClaimsApi } from '../../core/claims-api';
import { ClaimDetail, ClosureCheck, Status, StatusReference, Transition } from '../../core/contracts';
import { moneyUnits } from '../../core/money';
import { Session } from '../../core/session';
import { settings } from '../../core/settings';
import { Confirm } from '../../shared/confirm';
import { Feedback } from '../../shared/feedback';
import { Operation } from '../../shared/operation';
import { StatusChip } from '../../shared/status-chip';

@Component({
  selector: 'app-lifecycle',
  imports: [
    ReactiveFormsModule, MatButtonModule, MatMenuModule, MatCheckboxModule, MatFormFieldModule, MatInputModule,
    Feedback, StatusChip,
  ],
  templateUrl: './lifecycle.html',
})
export class Lifecycle {
  readonly claim = input.required<ClaimDetail>();
  readonly references = input.required<StatusReference[]>();
  readonly busy = input(false);
  readonly changed = output<void>();
  private readonly api = inject(ClaimsApi);
  private readonly dialogs = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly session = inject(Session);
  protected readonly task = new Operation();
  protected readonly preflight = new Operation();
  protected readonly target = signal<Status | null>(null);
  protected readonly checklist = signal<ClosureCheck | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    reason: [''], acknowledge: [false], positive: [false], liability: [false],
  });

  protected readonly next = computed(() => {
    const claim = this.claim();
    const approved = claim.reserveBalances.some(balance => {
      const amount = moneyUnits(balance.currentAmount);
      return amount !== null && amount !== 0n;
    });
    return (this.references().find(entry => entry.status === claim.status)?.allowedTransitions ?? [])
      .filter(status => status !== 'PendingPayment' || approved);
  });

  protected readonly assign = computed(() => this.target() === 'Open' && this.claim().status === 'Draft' && !this.claim().assignedHandlerId);
  protected readonly handler = computed(() => {
    const user = this.session.identity();
    return user?.role === 'handler' ? user.userId : settings.demoHandlerId;
  });
  protected readonly mustAcknowledge = computed(() =>
    this.target() === 'Open' && this.claim().status === 'Draft' &&
    this.claim().warnings.some(warning => warning.code === 'LOSS_OUTSIDE_POLICY_PERIOD'));
  protected readonly mustConfirmBalance = computed(() => this.checklist()?.requiresPositiveReserveConfirmation ?? false);
  protected readonly mustDetermineLiability = computed(() =>
    this.target() === 'PendingPayment' && this.claim().status === 'UnderInvestigation');
  protected readonly reasonRequired = computed(() =>
    this.target() === 'Reopened' || this.target() === 'Withdrawn' || this.mustConfirmBalance());
  protected readonly blockers = computed(() => Object.values(this.checklist()?.blockers ?? {}).flat());

  protected select(status: Status): void {
    this.target.set(status);
    this.form.reset();
    this.task.errors.set([]);
    this.checklist.set(null);
    if (status === 'Closed') this.loadChecklist();
  }

  protected loadChecklist(): void {
    this.preflight.run(this.api.closure(this.claim().id), checklist => this.checklist.set(checklist));
  }

  protected disabled(): boolean {
    const value = this.form.getRawValue();
    return this.busy() || this.preflight.pending() || this.task.pending() ||
      !this.next().includes(this.target()!) ||
      (this.target() === 'Closed' && !this.checklist()?.canClose) ||
      (this.assign() && !this.handler()) ||
      (this.mustAcknowledge() && !value.acknowledge) ||
      (this.mustConfirmBalance() && !value.positive) ||
      (this.mustDetermineLiability() && !value.liability) ||
      (this.reasonRequired() && !value.reason.trim());
  }

  protected submit(): void {
    const target = this.target();
    if (!target || this.disabled()) return;
    const value = this.form.getRawValue();
    const request: Transition = {
      targetStatus: target,
      assignedHandlerId: this.assign() ? this.handler() : undefined,
      reason: value.reason.trim() || null,
      acknowledgePolicyPeriodWarning: value.acknowledge,
      confirmPositiveReserveBalance: value.positive,
      liabilityDetermined: value.liability,
    };
    this.task.run(this.dialogs.open(Confirm, { data: {
      title: 'Confirm status change',
      messages: [target === 'Reopened' ? 'Reopen this claim and return it to Open?' : 'Change the claim status to ' + target + '?'],
      action: 'Confirm change',
    } }).afterClosed().pipe(switchMap(confirmed => confirmed ? this.api.transition(this.claim().id, request) : EMPTY)),
    result => {
      this.target.set(null);
      this.snackbar.open('Status updated to ' + result.status + '.', 'Dismiss', { duration: 3500 });
      this.changed.emit();
    });
  }
}
