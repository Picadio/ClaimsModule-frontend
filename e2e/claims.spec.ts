import { expect, Page, test } from '@playwright/test';

const claimId = '11111111-1111-4111-8111-111111111111';
const handlerId = '22222222-2222-4222-8222-222222222222';
const supervisorId = '33333333-3333-4333-8333-333333333333';
const managerId = '88888888-8888-4888-8888-888888888888';
const reserveId = '44444444-4444-4444-8444-444444444444';
const txnId = '55555555-5555-4555-8555-555555555555';
const fileId = '66666666-6666-4666-8666-666666666666';
const policyId = '77777777-7777-4777-8777-777777777777';
const claimNumber = 'CLM-2026-0000001';
const instant = '2025-06-02T10:00:00Z';
const path = '/api/claims/' + claimId;

async function interceptApi(page: Page, existingDraft = false) {
  const policy = {
    policyId, policyNumber: 'POL-100', clientName: 'Meridian', effectiveDate: '2025-01-01',
    expirationDate: '2025-12-31', status: 'Active', coverageTypes: ['Property'],
  };
  const warning = { code: 'RISK_OBJECTS_MISSING', field: 'RiskObjects', message: 'No risk objects were reported.' };
  const document = {
    id: fileId, fileName: 'loss.txt', documentType: 'Other', contentType: 'text/plain', sizeBytes: 16, notes: null,
    createdAt: instant, uploadedByUserId: supervisorId, downloadUrl: path + '/documents/' + fileId + '/download',
  };

  const users = [
    { userId: handlerId, displayName: 'Claims Handler', role: 'handler' },
    { userId: supervisorId, displayName: 'Claims Supervisor', role: 'supervisor' },
    { userId: managerId, displayName: 'Claims Manager', role: 'manager' },
  ];
  let claim: Record<string, unknown> | null = existingDraft ? {
    id: claimId, claimNumber, status: 'Draft', policyId, policyNumber: policy.policyNumber,
    clientName: policy.clientName, claimType: 'Property', severity: 'Standard', reportedAt: instant,
    lossEvent: { lossDate: instant, causeOfLossCode: 'COL-FIRE', lossDescription: 'Synthetic property loss' },
    parties: [], riskObjects: [], warnings: [], notes: null, assignedHandlerId: null, reserveBalances: [],
  } : null;
  let role = users[0];
  let approvalStatus = existingDraft ? 'PendingApproval' : '';
  let rejectionReason: string | undefined;
  let overrideEnabled = false;
  let uploaded = false;
  let validations = 0;
  let creates = 0;
  const transaction = () => ({
    id: txnId, reserveId, component: 'Indemnity', transactionType: 'Add', amount: 15000,
    previousBalance: 0, newBalance: 15000, changeReason: 'Initial estimate', changeSequence: 1,
    approvalStatus, requiredAuthority: 'Supervisor', requiresManagerOverride: false,
    postingStatus: approvalStatus === 'Approved' ? 'Posted' : approvalStatus === 'Rejected' ? 'Cancelled' : 'Pending',
    postingKey: 'reserve-key', postingJobId: null, rejectionReason,
    submittedByUserId: handlerId, approvedByUserId: approvalStatus === 'Approved' ? supervisorId : undefined,
    approvedByDisplayName: approvalStatus === 'Approved' ? 'Historical approver' : undefined,
    createdAt: instant, approvedAt: approvalStatus === 'Approved' ? instant : null, warnings: [],
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    const method = request.method();
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });

    if (endpoint === '/api/auth/demo-token') {
      expect(request.headers()['authorization']).toBeUndefined();
      role = users.find(user => user.role === request.postDataJSON().username)!;
      return json({ accessToken: role.role + '-test-token', expiresIn: 3600, tokenType: 'Bearer' });
    }
    expect(request.headers()['authorization']).toBe('Bearer ' + role.role + '-test-token');
    if (endpoint === '/api/auth/me') {
      return json({ userId: role.userId, organizationEntityId: policyId, role: role.role });
    }
    if (method !== 'GET' && endpoint !== '/api/claims/validate') {
      expect(request.headers()['idempotency-key']).toBeTruthy();
    }
    if (endpoint === '/api/reference/cause-of-loss-codes') {
      return json([{ code: 'COL-FIRE', name: 'Fire', perilCategory: 'Property' }]);
    }
    if (endpoint === '/api/reference/claim-statuses') {
      return json([{ status: 'Draft', allowedTransitions: ['Open'] }, { status: 'Open', allowedTransitions: ['UnderInvestigation'] }]);
    }
    if (endpoint === '/api/reference/users') return json(users);
    if (endpoint === '/api/policies/search') return json([policy]);
    if (endpoint === '/api/policies/' + policyId + '/coverage') return json({ policyId, coverageTypes: ['Property'] });
    if (endpoint === '/api/claims/validate') {
      expect(request.postDataJSON().parties[0].role).toBe('Claimant');
      expect(request.headers()['idempotency-key']).toBeUndefined();
      if (++validations === 1) {
        return json({ errors: {
          'LossEvent.LossDescription': ['Enter a more specific description.'],
          'parties[0].email': ['This email cannot be used.'],
        } }, 422);
      }
      return json({ warnings: [warning], initialReserveApprovalStatus: null, initialReserveRequiredAuthority: null });
    }
    if (endpoint === '/api/claims' && method === 'GET') {
      return json({ items: [], page: 1, pageSize: 20, totalCount: 0 });
    }
    if (endpoint === '/api/claims' && method === 'POST') {
      if (++creates === 1) return json({ errors: { Amount: ['Enter a different amount.'] } }, 422);
      const intake = request.postDataJSON();
      claim = {
        ...intake, id: claimId, claimNumber, status: 'Draft', policyNumber: policy.policyNumber,
        clientName: policy.clientName, reportedAt: instant, warnings: [warning],
        parties: intake.parties.map((party: object) => ({ ...party, id: handlerId, isActive: true })),
        notes: null, assignedHandlerId: null, isSlaBreached: false, reserveBalances: [],
      };
      return json({ id: claimId, claimNumber, status: 'Draft', warnings: [warning] }, 201);
    }
    if (endpoint === path && method === 'GET' && claim) return json(claim);
    if (endpoint === path + '/notes' && claim && method === 'PUT') {
      expect(request.postDataJSON()).toEqual({ notes: 'Synthetic notes' });
      claim.notes = request.postDataJSON().notes;
      return json({ claimId, notes: claim.notes });
    }
    if (endpoint === path + '/status' && claim) {
      expect(request.postDataJSON()).toMatchObject({ targetStatus: 'Open', assignedHandlerId: handlerId });
      claim = { ...claim, status: 'Open', assignedHandlerId: handlerId };
      return json({ id: claimId, status: 'Open', assignedHandlerId: handlerId });
    }
    if (endpoint === path + '/reserves' && method === 'GET') {
      const ledger = {
        claimId, totalReserves: approvalStatus === 'Approved' ? 15000 : 0, reserveLimitOverrideEnabled: overrideEnabled,
        components: approvalStatus ? [{
          id: reserveId, component: 'Indemnity', currentAmount: approvalStatus === 'Approved' ? 15000 : 0,
          pendingAmount: approvalStatus === 'PendingApproval' ? 15000 : 0, history: [transaction()],
        }] : [],
      };
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(ledger).replace('"pendingAmount":0', '"pendingAmount":0.0000'),
      });
    }
    if (endpoint === path + '/reserves' && method === 'POST') {
      expect(request.postDataJSON()).toMatchObject({ component: 'Indemnity', amount: 15000, transactionType: 'Add' });
      approvalStatus = 'PendingApproval';
      return json(transaction(), 201);
    }
    if (endpoint === path + '/reserves/' + txnId + '/approve') {
      expect(role.role).toBe('supervisor');
      approvalStatus = 'Approved';
      return json(transaction());
    }
    if (endpoint === path + '/reserves/' + txnId + '/reject' && method === 'POST') {
      expect(role.role).toBe('manager');
      expect(request.postDataJSON()).toEqual({ rejectionReason: 'Synthetic rejection' });
      approvalStatus = 'Rejected';
      rejectionReason = request.postDataJSON().rejectionReason;
      return json(transaction());
    }
    if (endpoint === path + '/reserves/manager-override' && method === 'PUT') {
      expect(role.role).toBe('manager');
      expect(request.postDataJSON()).toEqual({ reason: 'Synthetic override' });
      overrideEnabled = true;
      return json({ claimId, reserveLimitOverrideEnabled: overrideEnabled });
    }
    if (endpoint === path + '/documents') {
      if (method === 'POST') {
        expect(request.headers()['content-type']).toContain('multipart/form-data');
        expect(request.postData()).toContain('name="file"; filename="loss.txt"');
        uploaded = true;
        return json(document, 201);
      }
      return json(uploaded ? [document] : []);
    }
    if (endpoint === document.downloadUrl) {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: 'Synthetic report' });
    }
    if (endpoint === path + '/audit') {
      return json({ items: ['DOCUMENT_UPLOADED', 'GL_POSTING_SIMULATED', 'RESERVE_APPROVED'].map((eventType, index) => ({
        id: String(index), createdAt: instant, actorId: index === 1 ? null : supervisorId, eventType,
        description: eventType, oldValues: null, newValues: null, relatedEntityId: index === 0 ? fileId : txnId,
        relatedEntityType: index === 0 ? 'ClaimDocument' : 'ReserveHistory', correlationId: claimId,
      })), page: 1, pageSize: 20, totalCount: 3 });
    }
    return json({ title: 'Unexpected test request', detail: method + ' ' + endpoint }, 404);
  });
}

async function signIn(page: Page, username: string) {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('assigns a handler as manager and submits all three detail forms without reloading', async ({ page }) => {
  await interceptApi(page, true);
  await page.goto('/claims/' + claimId);
  await signIn(page, 'manager');
  await expect(page.getByRole('heading', { name: claimNumber })).toBeVisible();

  await page.getByLabel('Notes', { exact: true }).fill('Synthetic notes');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Notes saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Change status' }).click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
  await expect(page.getByText('Assign this claim to Claims Handler.')).toBeVisible();
  await page.getByRole('button', { name: 'Review change' }).click();
  await page.getByRole('button', { name: 'Confirm change' }).click();
  const header = page.locator('.claim-header');
  await expect(header.getByText('Open', { exact: true })).toBeVisible();
  await expect(header.getByText('Claims Handler', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Reserves' }).click();
  const reserve = page.getByRole('row').filter({ hasText: 'Initial estimate' });
  await expect(reserve.getByText('Claims Handler', { exact: true })).toBeVisible();
  await reserve.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByLabel('Rejection reason').fill('Synthetic rejection');
  await page.getByRole('button', { name: 'Review rejection' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(reserve.getByText('Rejected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enable manager override' }).click();
  await page.getByLabel('Override reason').fill('Synthetic override');
  await page.getByRole('button', { name: 'Enable override', exact: true }).click();
  await expect(page.getByText('Manager override enabled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('uses the configured fallback only after a directory failure', async ({ page }) => {
  await interceptApi(page, true);
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.claimsSettings = { demoHandlerId: ' + JSON.stringify(handlerId) + ' };',
  }));
  let failDirectory = false;
  await page.route('**/api/reference/users', route => failDirectory ? route.abort('timedout') : route.fulfill({ json: [] }));
  await page.goto('/claims/' + claimId);
  await signIn(page, 'manager');
  await page.getByRole('button', { name: 'Change status' }).click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
  await expect(page.getByText('No handler is available to assign.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review change' })).toBeDisabled();

  failDirectory = true;
  await page.reload();
  await signIn(page, 'manager');
  await expect(page.getByRole('button', { name: 'Retry user directory' })).toBeVisible();
  await page.getByRole('button', { name: 'Change status' }).click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Review change' }).click();
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect(page.locator('.claim-header').getByText('Open', { exact: true })).toBeVisible();
});

test('registers a demo account in the selected role and returns to sign in', async ({ page }) => {
  let registrations = 0;
  await page.route('**/api/auth/register', async route => {
    registrations++;
    const request = route.request();
    expect(request.postDataJSON()).toEqual({ username: 'Demo.Manager', password: 'Demo-password', role: 'manager' });
    expect(request.headers()['authorization']).toBeUndefined();
    expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    await route.fulfill({ status: 201, json: { userId: 'manager-id', displayName: 'Demo.Manager', role: 'manager' } });
  });

  await page.goto('/login');
  await page.getByRole('link', { name: 'Create a demo account' }).click();
  await expect(page.getByRole('heading', { name: 'Create a demo account' })).toBeVisible();
  await page.getByLabel('Username').fill('Demo.Manager');
  await page.getByLabel('Password').fill('Demo-password');
  await page.getByRole('combobox', { name: 'Role' }).click();
  await page.getByRole('option', { name: 'Manager' }).click();
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Demo account created. Sign in to continue.')).toBeVisible();
  expect(registrations).toBe(1);
});

test('creates a claim, opens it, approves a reserve as a second user, and audits an attachment', async ({ page }) => {
  await interceptApi(page);
  await page.goto('/claims');
  await signIn(page, 'handler');
  await expect(page.getByText('No claims match these filters.')).toBeVisible();
  await page.clock.setFixedTime(new Date(2025, 5, 1, 23, 59));
  await page.getByRole('link', { name: 'Log new claim' }).click();
  await page.getByLabel('Policy number or client name').fill('Meridian');
  await page.getByRole('option', { name: 'POL-100 · Meridian' }).click();
  await page.clock.setFixedTime(new Date(2025, 5, 2, 10, 10));
  await page.getByLabel('Loss date', { exact: true }).click();
  await page.getByRole('button', { name: 'Choose month and year' }).click();
  await page.getByRole('button', { name: '2025', exact: true }).click();
  await page.getByRole('button', { name: 'June 2025', exact: true }).click();
  await expect(page.getByRole('button', { name: 'June 3, 2025', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'June 2, 2025', exact: true }).click();
  await page.getByLabel('Loss time', { exact: true }).fill('10:00');
  await expect(page.getByText('In force on loss date')).toHaveClass(/success/);
  await page.getByRole('combobox', { name: 'Cause of loss', exact: true }).fill('Fir');
  await page.getByRole('option', { name: 'Fire' }).click();
  await page.getByLabel('Loss description').fill('Synthetic property damage due to a fire.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Add at least one claimant to continue.')).toBeVisible();
  await page.getByRole('button', { name: 'Add party', exact: true }).click();
  await page.getByLabel('First name').fill('Sample');
  await page.getByLabel('Last name').fill('Claimant');
  await page.getByRole('button', { name: 'Add party', exact: true }).last().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  const description = page.getByLabel('Loss description');
  const create = page.getByRole('button', { name: 'Create claim', exact: true });
  await create.click();
  await expect(page.locator('mat-form-field').filter({ has: description }).locator('mat-error'))
    .toHaveText('Enter a more specific description.');
  await expect(description).toHaveAttribute('aria-invalid', 'true');
  await description.fill('Synthetic damage to a property after a fire in the storage area.');
  await expect(page.getByText('Enter a more specific description.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Email: This email cannot be used.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Add party', exact: true }).click();
  await page.getByLabel('First name').fill('Sample');
  await page.getByLabel('Last name').fill('Claimant');
  await page.getByRole('button', { name: 'Add party', exact: true }).last().click();
  await expect(page.getByText('This email cannot be used.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue' }).click();

  const initialAmount = page.getByLabel('Optional amount (USD)');
  await initialAmount.fill('100');
  const warning = page.getByRole('dialog');
  await create.click();
  await expect(warning.getByText('No risk objects were reported.')).toBeVisible();
  await warning.getByRole('button', { name: 'Create claim' }).click();
  await expect(page.locator('mat-form-field').filter({ has: initialAmount }).locator('mat-error'))
    .toHaveText('Enter a different amount.');
  await initialAmount.clear();
  await expect(page.getByText('Enter a different amount.', { exact: true })).toHaveCount(0);
  await create.click();
  await warning.getByRole('button', { name: 'Create claim' }).click();
  await expect(page.getByRole('heading', { name: claimNumber })).toBeVisible();
  await page.getByRole('button', { name: 'Change status' }).click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Review change' }).click();
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect(page.locator('.claim-header').getByText('Open', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Reserves' }).click();
  await page.getByRole('button', { name: 'Add reserve' }).click();
  await page.getByLabel('Change amount (USD)').fill('15000');
  await expect(page.getByText('Supervisor approval required')).toBeVisible();
  await page.getByLabel('Reason', { exact: true }).fill('Initial estimate');
  await page.getByRole('button', { name: 'Submit reserve' }).click();
  await expect(page.getByText('PendingApproval', { exact: true })).toBeVisible();
  await expect(page.locator('.reserve-card .warning-text')).toHaveText('$' + '15,000.00');
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retract', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'supervisor');
  await expect(page.getByRole('heading', { name: claimNumber })).toBeVisible();
  await page.getByRole('tab', { name: 'Reserves' }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Posted', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Historical approver', exact: true })).toBeVisible();
  await expect(page.locator('.reserve-card .warning-text')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Documents' }).click();
  await page.getByLabel('File', { exact: true }).setInputFiles({
    name: 'loss.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic report'),
  });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'loss.txt' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('loss.txt');

  await page.getByRole('tab', { name: 'Audit Log' }).click();
  const audit = page.getByRole('table', { name: 'Claim audit events, newest first' });
  await expect(audit.getByRole('row').nth(1)).toContainText('DOCUMENT_UPLOADED');
  await expect(audit.getByRole('row').nth(2)).toContainText('GL_POSTING_SIMULATED');
  await audit.getByRole('link', { name: 'Document', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('row').filter({ hasText: 'loss.txt' })).toHaveClass('highlight');
});
