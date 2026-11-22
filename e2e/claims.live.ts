
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const uiOrigin = process.env['CLAIMS_LIVE_BASE_URL'];
const handlerPassword = process.env['CLAIMS_LIVE_HANDLER_PASSWORD'];
const supervisorPassword = process.env['CLAIMS_LIVE_SUPERVISOR_PASSWORD'];

async function signIn(page: Page, role: string, password: string): Promise<void> {
  await page.getByLabel('Username').fill(role);
  try {
    await page.getByLabel('Password').fill(password);
  } catch {
    throw new Error('Could not fill the demo account password.');
  }
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 20_000 });
}

test('Azure demo completes FNOL, approval, GL posting, Blob download and audit', async ({ page, browser }) => {
  test.skip(!uiOrigin || !handlerPassword || !supervisorPassword, 'Requires an Azure demo URL and both demo passwords.');
  const marker = 'azure-smoke-' + randomUUID().slice(0, 12);
  const fileName = marker + '.txt';
  const fileContents = 'Synthetic Azure smoke test ' + marker;

  await page.goto('/claims');
  await signIn(page, 'handler', handlerPassword!);
  await page.getByRole('link', { name: 'Log new claim' }).click();
  await page.getByLabel('Policy number or client name').fill('POL-2024-001001');
  await page.getByRole('option', { name: /POL-2024-001001/ }).click();
  await page.getByLabel('Loss date and time').fill('2025-06-02T10:00');
  await page.getByRole('combobox', { name: 'Cause of loss', exact: true }).click();
  await page.getByRole('option', { name: 'Fire', exact: true }).click();
  await page.getByLabel('Loss description').fill('Synthetic property damage for ' + marker);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Add party', exact: true }).click();
  await page.getByLabel('First name').fill('Demo');
  await page.getByLabel('Last name').fill('Claimant');
  await page.getByRole('button', { name: 'Add party', exact: true }).last().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create claim', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create claim', exact: true }).click();
  await expect(page.getByRole('heading', { name: /CLM-\d{4}-\d{7}/ })).toBeVisible();
  const claimUrl = page.url();

  await page.getByRole('button', { name: 'Change status' }).click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Review change' }).click();
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect(page.locator('.claim-header').getByText('Open', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Reserves' }).click();
  await page.getByRole('button', { name: 'Add reserve' }).click();
  await page.getByLabel('Change amount (USD)').fill('15000');
  await page.getByLabel('Reason', { exact: true }).fill(marker);
  await page.getByRole('button', { name: 'Submit reserve' }).click();
  const handlerReserve = page.getByRole('row').filter({ hasText: marker });
  await expect(handlerReserve.getByText('PendingApproval', { exact: true })).toBeVisible();
  await expect(handlerReserve.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);

  const supervisor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const reviewer = await supervisor.newPage();
    await reviewer.goto(claimUrl);
    await signIn(reviewer, 'supervisor', supervisorPassword!);
    await reviewer.getByRole('tab', { name: 'Reserves' }).click();
    const reserve = reviewer.getByRole('row').filter({ hasText: marker });
    await reserve.getByRole('button', { name: 'Approve', exact: true }).click();
    await reviewer.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(reserve.getByText('Posted', { exact: true })).toBeVisible({ timeout: 60_000 });

    await reviewer.getByRole('tab', { name: 'Documents' }).click();
    await reviewer.getByLabel('File', { exact: true }).setInputFiles({
      name: fileName, mimeType: 'text/plain', buffer: Buffer.from(fileContents),
    });
    await reviewer.getByRole('button', { name: 'Upload', exact: true }).click();
    const document = reviewer.getByRole('row').filter({ hasText: fileName });
    await expect(document).toBeVisible({ timeout: 20_000 });
    const download = reviewer.waitForEvent('popup', { timeout: 20_000 })
      .then(popup => popup.waitForEvent('download', { timeout: 20_000 }));
    await document.getByRole('button', { name: 'Download', exact: true }).click();
    const file = await download;
    const url = new URL(file.url());
    expect(url.origin === new URL(uiOrigin!).origin).toBe(false);
    expect(url.searchParams.has('sig')).toBe(true);
    expect(file.suggestedFilename()).toBe(fileName);
    expect(await readFile(await file.path(), 'utf8')).toBe(fileContents);

    await reviewer.getByRole('tab', { name: 'Audit Log' }).click();
    const audit = reviewer.getByRole('table', { name: 'Claim audit events, newest first' });
    for (const event of ['RESERVE_APPROVED', 'GL_POSTING_SIMULATED', 'DOCUMENT_UPLOADED']) {
      await expect(audit.getByText(event, { exact: true })).toHaveCount(1);
    }
  } finally {
    await supervisor.close();
  }
});
