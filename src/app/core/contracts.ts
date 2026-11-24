
export const statuses = ['Draft', 'Open', 'UnderInvestigation', 'PendingPayment', 'Closed', 'Reopened', 'Withdrawn'] as const;
export const roles = ['Claimant', 'Insured', 'ThirdParty', 'Witness', 'Attorney'] as const;
export const partyTypes = ['Person', 'Company'] as const;
export const assetTypes = ['Vehicle', 'Property', 'Person', 'Equipment', 'Other'] as const;
export const severities = ['Standard', 'Minor', 'Critical', 'Catastrophic'] as const;
export const components = ['Indemnity', 'Expense', 'ALAE', 'SubrogationRecoverable'] as const;

export type Status = typeof statuses[number];
export type PartyRole = typeof roles[number];
export type PartyType = typeof partyTypes[number];
export type AssetType = typeof assetTypes[number];
export type Severity = typeof severities[number];
export type ReserveComponent = typeof components[number];
export type Role = 'handler' | 'supervisor' | 'manager';
export type Authority = 'Automatic' | 'Supervisor' | 'Manager';
export type Approval = 'AutoApproved' | 'PendingApproval' | 'Approved' | 'Rejected' | 'Cancelled';
export type Posting = 'Pending' | 'Posted' | 'Failed' | 'Cancelled';
export type TransactionType = 'Add' | 'Adjust' | 'Reverse';

// The HTTP adapter preserves decimal tokens as strings so all four fractional digits survive.
export type Money = string;

export interface Identity { userId: string; organizationEntityId: string; role: Role; }
export interface UserReference { userId: string; displayName: string; role: Role; }
export interface Credentials { username: string; password: string; }
export interface DemoRegistration extends Credentials { role: Role; }
export interface DemoToken { accessToken: string; tokenType: string; expiresIn: number; }
export interface Policy {
  policyId: string;
  policyNumber: string;
  clientName: string;
  effectiveDate: string;
  expirationDate: string;
  status: string;
  coverageTypes: string[];
}
export interface Coverage { policyId: string; coverageTypes: string[]; }
export interface Cause { code: string; name: string; perilCategory: string; }
export interface StatusReference { status: Status; allowedTransitions: Status[]; }
export interface Page<T> { items: T[]; page: number; pageSize: number; totalCount: number; }
export interface ClaimFilters {
  status: Status[];
  dateFrom: string;
  dateTo: string;
  assignedHandlerName: string;
  causeOfLossCode: string;
  search: string;
}
export interface ClaimSummary {
  id: string;
  claimNumber: string;
  clientName: string | null;
  policyNumber: string | null;
  lossDate: string;
  causeOfLossCode: string;
  status: Status;
  totalReserves: Money;
  assignedHandlerId: string | null;
  isSlaBreached: boolean;
  lastSlaBreachAt: string | null;
}
export interface Loss {
  lossDate: string;
  causeOfLossCode: string;
  lossDescription: string;
  lossLocation: string | null;
  estimatedLossAmount: Money | null;
  policeReportNumber: string | null;
}
export interface PartyInput {
  role: PartyRole;
  partyType: PartyType;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}
export interface Party extends PartyInput { id: string; isActive: boolean; }
export interface RiskInput {
  assetType: AssetType;
  assetDescription: string;
  damageDescription: string | null;
  assetReference: string | null;
  isPrimary: boolean;
}
export interface Risk extends RiskInput { id: string; }
export interface ClaimWarning { code: string; field: string; message: string; }
export interface InitialReserve { component: ReserveComponent; amount: Money; }
export interface CreateClaim {
  policyId: string | null;
  claimType: string;
  severity: Severity;
  lossEvent: Loss;
  parties: PartyInput[];
  riskObjects: RiskInput[];
  initialReserve: InitialReserve | null;
}
export interface FnolValidation {
  warnings: ClaimWarning[];
  initialReserveApprovalStatus: Approval | null;
  initialReserveRequiredAuthority: Authority | null;
}
export interface CreatedClaim {
  id: string;
  claimNumber: string;
  status: Status;
  warnings: ClaimWarning[];
  initialReserve?: ReserveTransaction;
}
export interface ClaimDetail extends Omit<CreatedClaim, 'initialReserve'> {
  claimType: string;
  policyId: string | null;
  policyNumber: string | null;
  clientName: string | null;
  reportedAt: string;
  lossEvent: Loss;
  parties: Party[];
  riskObjects: Risk[];
  assignedHandlerId: string | null;
  closedAt: string | null;
  closureReason: string | null;
  severity: Severity;
  notes: string | null;
  isSlaBreached: boolean;
  lastSlaBreachAt: string | null;
  reserveBalances: ReserveBalance[];
}
export interface ClosureCheck {
  transitionAllowed: boolean;
  canClose: boolean;
  requiresPositiveReserveConfirmation: boolean;
  blockers: Record<string, string[]>;
}
export interface Transition {
  targetStatus: Status;
  assignedHandlerId?: string;
  reason: string | null;
  acknowledgePolicyPeriodWarning: boolean;
  confirmPositiveReserveBalance: boolean;
  liabilityDetermined: boolean;
}
export interface StatusResult {
  id: string;
  status: Status;
  assignedHandlerId: string | null;
  closedAt: string | null;
  closureReason: string | null;
}
export interface NotesResult { claimId: string; notes: string | null; }
export interface PolicyResult { claimId: string; policyId: string; policyNumber: string; clientName: string; warnings: ClaimWarning[]; }
export interface ReserveChange {
  amount: Money;
  changeReason: string;
  transactionType: TransactionType;
  replacesRejectedTransactionId?: string;
}
export interface ReserveTransaction {
  id: string;
  reserveId: string;
  component: ReserveComponent;
  transactionType: TransactionType;
  amount: Money;
  previousBalance: Money;
  newBalance: Money;
  changeReason: string;
  changeSequence: number;
  approvalStatus: Approval;
  requiredAuthority: Authority;
  requiresManagerOverride: boolean;
  postingStatus: Posting;
  postingKey: string;
  postingJobId: string | null;
  submittedByUserId: string | null;
  createdAt: string;
  approvedByUserId?: string;
  approvedByDisplayName?: string;
  approvedAt: string | null;
  rejectedByUserId?: string;
  rejectionReason?: string;
  retractedByUserId?: string;
  replacesRejectedTransactionId?: string;
  warnings: ClaimWarning[];
}
export interface ReserveBalance {
  id: string;
  component: ReserveComponent;
  currentAmount: Money;
  pendingAmount: Money;
  hasApprovedTransaction?: boolean;
  status?: 'Active' | 'Closed';
  approvalStatus?: Approval | null;
}
export interface ComponentLedger extends ReserveBalance { history: ReserveTransaction[]; }
export interface Ledger {
  claimId: string;
  totalReserves: Money;
  components: ComponentLedger[];
  reserveLimitOverrideEnabled: boolean;
}
export interface OverrideResult { claimId: string; reserveLimitOverrideEnabled: boolean; }
export interface ClaimDocument {
  id: string;
  fileName: string;
  documentType: string;
  contentType: string;
  sizeBytes: number;
  notes: string | null;
  createdAt: string;
  uploadedByUserId: string | null;
  downloadUrl: string | null;
}
export interface AuditEntry {
  id: string;
  createdAt: string;
  actorId: string | null;
  eventType: string;
  description: string;
  oldValues: unknown;
  newValues: unknown;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  correlationId: string;
}

