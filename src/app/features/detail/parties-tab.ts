
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { EMPTY, switchMap } from 'rxjs';
import { ClaimsApi } from '../../core/claims-api';
import { ClaimDetail, Party, PartyInput } from '../../core/contracts';
import { Confirm } from '../../shared/confirm';
import { Feedback } from '../../shared/feedback';
import { Operation } from '../../shared/operation';
import { PartyForm, partyName } from '../../shared/party-form';

@Component({
  selector: 'app-parties-tab',
  imports: [MatButtonModule, PartyForm, Feedback],
  template: `
    <section class="tab-body">
      <div class="section-title"><h2>Parties</h2><button mat-stroked-button [disabled]="operation.pending() || editing()"
        (click)="editing.set(true)">Add party</button></div>
      <app-feedback [loading]="operation.pending()" [errors]="operation.errors()" />
      @if (editing()) {
        <app-party-form [busy]="operation.pending()" (saved)="add($event)" (cancelled)="editing.set(false)" />
      }
      <div class="table-frame">
        <table>
          <caption class="visually-hidden">Claim parties</caption>
          <thead><tr><th>Name</th><th>Role</th><th>Type</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            @for (party of claim().parties; track party.id) {
              <tr [class.highlight]="party.id === relatedId()">
                <td>{{ nameOf(party) }} @if (party.notes) { <div class="muted">{{ party.notes }}</div> }</td>
                <td><span class="badge">{{ party.role }}</span></td><td>{{ party.partyType }}</td>
                <td><div>{{ party.email || '—' }}</div><div>{{ party.phone }}</div></td>
                <td>{{ party.isActive ? 'Active' : 'Inactive' }}</td>
                <td>@if (party.isActive) {
                  <button mat-button [disabled]="operation.pending() || lastClaimant(party)" (click)="remove(party)">Remove</button>
                  @if (lastClaimant(party)) { <span class="muted">Last active claimant</span> }
                }</td>
              </tr>
            } @empty { <tr><td colspan="6">No parties found.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class PartiesTab {
  readonly claim = input.required<ClaimDetail>();
  readonly relatedId = input<string | null>(null);
  readonly changed = output<void>();
  private readonly api = inject(ClaimsApi);
  private readonly dialogs = inject(MatDialog);
  protected readonly operation = new Operation();
  protected readonly editing = signal(false);
  protected readonly nameOf = partyName;
  private readonly activeClaimants = computed(() =>
    this.claim().parties.filter(party => party.isActive && party.role === 'Claimant').length);

  protected lastClaimant(party: Party): boolean {
    return party.role === 'Claimant' && party.isActive && this.activeClaimants() <= 1;
  }

  protected add(party: PartyInput): void {
    this.operation.run(this.api.addParty(this.claim().id, party), () => {
      this.editing.set(false);
      this.changed.emit();
    });
  }

  protected remove(party: Party): void {
    if (!party.isActive || this.lastClaimant(party)) return;
    this.operation.run(this.dialogs.open(Confirm, { data: {
      title: 'Remove party?', messages: [partyName(party) + ' will become inactive.'], action: 'Remove party',
    } }).afterClosed().pipe(switchMap(confirmed => confirmed ? this.api.removeParty(this.claim().id, party.id) : EMPTY)),
    () => this.changed.emit());
  }
}
