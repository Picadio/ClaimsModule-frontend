
import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ClaimsApi } from '../../core/claims-api';
import { ClaimDetail, Policy } from '../../core/contracts';
import { MoneyPipe } from '../../core/money';
import { Feedback } from '../../shared/feedback';
import { Operation } from '../../shared/operation';
import { PolicySearch } from '../../shared/policy-search';
import { lossDayOutsidePeriod } from '../../core/policy-period';

@Component({
  selector: 'app-overview-tab',
  imports: [DatePipe, MoneyPipe, ReactiveFormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule,
    MatInputModule, PolicySearch, Feedback],
  templateUrl: './overview-tab.html',
})
export class OverviewTab {
  readonly claim = input.required<ClaimDetail>();
  readonly changed = output<void>();
  private readonly api = inject(ClaimsApi);
  protected readonly notesTask = new Operation();
  protected readonly policyTask = new Operation();
  protected readonly saved = signal(false);
  protected readonly linking = signal(false);
  protected readonly policy = signal<Policy | null>(null);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly notesForm = this.fb.group({ notes: [''] });
  protected readonly notes = this.notesForm.controls.notes;
  protected readonly acknowledgement = this.fb.control(false);

  constructor() {
    effect(() => {
      const notes = this.claim().notes ?? '';
      if (this.notes.pristine) this.notes.setValue(notes);
    });
  }

  protected saveNotes(): void {
    if (this.notesTask.pending() || this.notes.pristine) return;
    this.saved.set(false);
    this.notesTask.run(this.api.saveNotes(this.claim().id, this.notes.value.trim() || null), result => {
      this.notes.reset(result.notes ?? '');
      this.saved.set(true);
      this.changed.emit();
    });
  }

  protected choosePolicy(policy: Policy | null): void {
    this.policy.set(policy);
    this.acknowledgement.reset();
  }

  protected needsAcknowledgement(): boolean {
    const policy = this.policy();
    return this.claim().status !== 'Draft' && !!policy && lossDayOutsidePeriod(this.claim().lossEvent.lossDate, policy);
  }

  protected linkPolicy(): void {
    const policy = this.policy();
    if (!policy || (this.needsAcknowledgement() && !this.acknowledgement.value)) return;
    this.policyTask.run(this.api.linkPolicy(this.claim().id, policy.policyId, this.acknowledgement.value), () => {
      this.linking.set(false);
      this.choosePolicy(null);
      this.changed.emit();
    });
  }
}

