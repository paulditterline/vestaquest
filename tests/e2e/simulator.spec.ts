import { expect, test } from '@playwright/test';

test('renders an exact, addressable Flagship fixture', async ({ page }) => {
  await page.goto('/?fixture=title&shell=black');

  await expect(
    page.getByRole('heading', { name: 'Flagship Board Lab' }),
  ).toBeVisible();
  await expect(page.getByTestId('board-row')).toHaveCount(6);
  await expect(page.locator('.flap-cell')).toHaveCount(132);
  await expect(page.locator('.simulator')).toHaveAttribute(
    'data-shell',
    'black',
  );
  await expect(page.locator('.flap-cell[data-row="0"]')).toHaveCount(22);
});

test('switches fixtures, reveal frames, and physical shell', async ({
  page,
}) => {
  await page.goto('/?fixture=title&shell=black');
  await page.getByLabel('Screen', { exact: true }).selectOption('initiative');
  await page.getByRole('button', { name: 'Roll result' }).click();

  await expect(page.getByText('Goblin goes first.')).toBeVisible();
  await expect(page.locator('.flap-cell[data-code="69"]')).toHaveCount(8);
  await expect(page).toHaveURL(/fixture=initiative/);

  await page.getByRole('button', { name: 'white' }).click();
  await expect(page.locator('.simulator')).toHaveAttribute(
    'data-shell',
    'white',
  );
  await expect(page).toHaveURL(/shell=white/);
  await expect(page.locator('.flap-cell')).toHaveCount(132);
});

test('marks an accepted choice with a green tile', async ({ page }) => {
  await page.goto('/?fixture=choice-marker&shell=black');
  await page.getByRole('button', { name: 'Choice accepted' }).click();

  await expect(
    page.getByText('Selected choice 1, Bash the door.'),
  ).toBeVisible();
  await expect(
    page.locator('.flap-cell[data-row="2"][data-column="0"]'),
  ).toHaveAttribute('data-code', '66');
});

test('fits a mobile viewport without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?fixture=class-select&shell=black');

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  await expect(page.locator('.flap-cell')).toHaveCount(132);
});

test('renders every single-frame fixture and exposes code inspection', async ({
  page,
}) => {
  await page.goto('/?fixture=title&shell=black');
  const screen = page.getByLabel('Screen', { exact: true });

  for (const fixture of ['class-select', 'combat-hud', 'death']) {
    await screen.selectOption(fixture);
    await expect(page.locator('.flap-cell')).toHaveCount(132);
  }

  await page.getByLabel('Show character codes').check();
  await expect(page.locator('.flap-cell__code')).toHaveCount(132);
});
