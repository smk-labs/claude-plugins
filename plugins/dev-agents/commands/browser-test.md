---
description: Screenshot and smoke-test pages with Playwright
---

# Browser Test

Test a webpage or take a screenshot using Playwright CLI.

**Request:** $ARGUMENTS

## Screenshot output directory

Always save screenshots to `./screenshots/` relative to the current working directory. Create the directory if it doesn't exist. Use unique filenames with timestamp:

```
./screenshots/<domain>-<label>-<timestamp>.png
```

Example: `./screenshots/example.com-full-1707842400.png`

## Step 1: Determine the task type

- If the user wants a **screenshot** (no interaction needed) → go to "Screenshots"
- If the user wants to **test/check** something on a page (assertions only) → go to "Browser Tests"
- If the task requires **interaction** (login, fill form, click, navigate) → go to "Interactive Tasks"
- If the user wants to **record** a flow → go to "Recording Interactions with Codegen"

## Screenshots

```bash
mkdir -p ./screenshots

# Basic
npx playwright screenshot --wait-for-timeout=3000 "https://example.com" "./screenshots/example.com-$(date +%s).png"

# Full page
npx playwright screenshot --full-page --wait-for-timeout=3000 "https://example.com" "./screenshots/example.com-full-$(date +%s).png"

# Mobile viewport
npx playwright screenshot --device="iPhone 13" --wait-for-timeout=3000 "https://example.com" "./screenshots/example.com-mobile-$(date +%s).png"

# Dark mode
npx playwright screenshot --color-scheme=dark --wait-for-timeout=3000 "https://example.com" "./screenshots/example.com-dark-$(date +%s).png"
```

After the screenshot, use the **Read tool** on the `.png` to show it inline.

## Browser Tests

For checks/assertions/interactions, write a temp test file and run it.

1. Write test to `/tmp/pw-test-$(date +%s).spec.js`:

```js
const { test, expect } = require('@playwright/test');

test('description', async ({ page }) => {
  await page.goto('URL');
  // Example assertions:
  // await expect(page.locator('h1')).toBeVisible();
  // await expect(page).toHaveTitle(/Expected/);
  // await expect(page.locator('button')).toHaveCount(3);
});
```

2. Run it:

```bash
npx playwright test /tmp/pw-test-*.spec.js --reporter=list
```

3. Delete the temp test file after reporting results.

## Interactive Tasks (Login, Forms, Multi-Step Flows)

For anything requiring clicks, typing, or navigation — use test file mode.

### Login Flow Pattern

```js
const { test, expect } = require('@playwright/test');

test('login and screenshot dashboard', async ({ page }) => {
  await page.goto('https://app.example.com/login');

  // Fill credentials
  await page.locator('input[name="email"]').fill('user@example.com');
  await page.locator('input[name="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();

  // Wait for redirect after login
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await expect(page.locator('h1')).toContainText('Dashboard');

  // Screenshot the authenticated page
  await page.screenshot({ path: './screenshots/dashboard.png', fullPage: true });
});
```

### Common Interactions Reference

```js
// --- Text Input ---
await page.locator('#email').fill('user@test.com');        // Clear + set value
await page.locator('#search').pressSequentially('query');   // Type char by char (triggers keydown events)

// --- Clicks ---
await page.locator('button:has-text("Submit")').click();
await page.locator('#menu').dblclick();
await page.locator('#item').click({ button: 'right' });

// --- Dropdowns & Checkboxes ---
await page.locator('select#country').selectOption('US');
await page.locator('select#colors').selectOption(['red', 'blue']);  // Multi-select
await page.locator('#agree').setChecked(true);

// --- Keyboard ---
await page.locator('#input').press('Enter');
await page.locator('#input').press('Control+a');

// --- File Upload ---
await page.locator('input[type="file"]').setInputFiles('/path/to/file.pdf');

// --- Waiting ---
await page.waitForURL('**/success');                                // URL change
await page.waitForSelector('.toast-message', { timeout: 5000 });   // Element appears
await page.waitForLoadState('networkidle');                         // Network quiet

// --- Screenshots at any point ---
await page.screenshot({ path: './screenshots/step-1.png' });
await page.locator('#modal').screenshot({ path: './screenshots/modal.png' });  // Element only
```

### Saving Auth State for Reuse

```js
// After login, save cookies/localStorage:
await page.context().storageState({ path: '/tmp/auth-state.json' });
```

Then reuse in later tests or screenshot commands:
```bash
npx playwright screenshot --load-storage=/tmp/auth-state.json "https://app.example.com/dashboard" "./screenshots/dashboard.png"
```

### Locator Strategy (Preferred Order)

1. `page.getByRole('button', { name: 'Submit' })` — accessible role + name (most resilient)
2. `page.getByText('Welcome back')` — visible text
3. `page.getByLabel('Email')` — form label
4. `page.getByPlaceholder('Enter email')` — placeholder text
5. `page.locator('[data-testid="login-btn"]')` — test IDs
6. `page.locator('input[name="email"]')` — CSS selector (last resort)

Playwright auto-waits for elements to be visible and enabled before acting — no manual `sleep()` needed.

## Recording Interactions with Codegen

Use `npx playwright codegen` to open a browser and record actions as code:

```bash
# Record interactions on a URL — generates test code in real time
npx playwright codegen "https://app.example.com"

# Save generated code to a file
npx playwright codegen -o /tmp/recorded-test.spec.js "https://app.example.com"

# Record with device emulation
npx playwright codegen --device="iPhone 13" "https://app.example.com"

# Record with saved auth state (skip login)
npx playwright codegen --load-storage=/tmp/auth-state.json "https://app.example.com"
```

**Note:** Codegen opens an interactive browser window — requires a display. Not usable in headless/CI environments.

## Troubleshooting JS-Heavy Sites

Headless Chromium can fail on sites with heavy client-side rendering (Next.js, SPAs, React SSR hydration). Common symptom: "Application error: a client-side exception has occurred."

**Workarounds (try in order):**

1. **Increase wait time** — some sites need longer to hydrate:
   ```bash
   npx playwright screenshot --wait-for-timeout=8000 "URL" "output.png"
   ```

2. **Try the index/listing page** instead of deep-linked routes — index pages often use SSR while sub-routes rely on client-side navigation

3. **Use `--wait-for-selector`** in test mode to wait for specific content:
   ```js
   await page.goto('URL', { waitUntil: 'networkidle' });
   await page.waitForSelector('h1', { timeout: 10000 });
   ```

4. **Add a user-agent** if the site blocks headless browsers — use test mode and set:
   ```js
   await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 ...' });
   ```

**After a failed screenshot:** Always check the `.png` with the Read tool — the error page screenshot often reveals the cause (JS error, 404, bot block, etc.).

## Rules

- Screenshots go in `./screenshots/` (project-local, easy to review in IDE)
- Temp test files go in `/tmp/` — always clean up after
- Default `--wait-for-timeout=3000` unless user says otherwise
- Report concisely: pass/fail, what was checked, screenshot if taken
- Playwright + Chromium are pre-installed globally — runs should be instant
- Always visually verify screenshots with the Read tool — don't assume success from exit code alone
