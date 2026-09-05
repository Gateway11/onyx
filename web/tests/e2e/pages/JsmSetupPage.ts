import { expect, Page } from "@playwright/test";

export class JsmSetupPage {
  constructor(private readonly page: Page) {}

  async openFromCatalog() {
    await this.page.goto("/admin/add-connector");
    await this.page.getByText("Jira Service Management", { exact: true }).click();
    await expect(this.page).toHaveURL(/\/admin\/connectors\/jira_service_management/);
  }

  async expectCredentialForm() {
    await expect(this.page.getByLabel("Jira API Token", { exact: false })).toBeVisible();
    await expect(this.page.getByLabel("Jira User Email", { exact: false })).toBeVisible();
  }
}
