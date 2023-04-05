import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser,shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest('should create a pageload transaction', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const req = waitForTransactionRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const eventData = envelopeRequestParser(await req);
  const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');

  const { start_timestamp: startTimestamp } = eventData;

  expect(startTimestamp).toBeCloseTo(timeOrigin, 1);

  expect(eventData.contexts?.trace?.op).toBe('pageload');
  expect(eventData.spans?.length).toBeGreaterThan(0);
  expect(eventData.transaction_info?.source).toEqual('url');
});
