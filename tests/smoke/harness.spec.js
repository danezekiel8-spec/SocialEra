const { test } = require('@playwright/test');

test('smoke harness scaffold', async () => {
  test.skip(true, 'V1 installs the Playwright harness only. Real smoke checks start in V3.');
});
