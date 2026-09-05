import { test } from "@playwright/test";
import { JsmSetupPage } from "../pages/JsmSetupPage";

test("JSM catalog opens its credential form", async ({ page }) => {
  const setup = new JsmSetupPage(page);
  await setup.openFromCatalog();
  await setup.expectCredentialForm();
});
