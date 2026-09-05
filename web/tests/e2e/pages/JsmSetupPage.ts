import { expect, Page } from "@playwright/test";

export class JsmSetupPage {
  constructor(private readonly page: Page) {}

  async openFromCatalog() {
    await this.page.goto("/admin/add-connector");
    await this.page.getByText("Jira Service Management", { exact: true }).click();
    await expect(this.page).toHaveURL(/\/admin\/connectors\/jira_service_management/);
  }

  async expectIndexedProject() {
    await this.page.goto("/admin/indexing/status");
    await expect(this.page.getByText("JSM acceptance project", { exact: true })).toBeVisible();
  }

  async expectCredentialForm() {
    await this.page.getByRole("button", { name: "Create New", exact: true }).click();
    await expect(
      this.page.getByLabel("API or Personal Access Token", { exact: true }),
    ).toBeVisible();
    await expect(this.page.getByLabel("Jira User Email", { exact: false })).toBeVisible();
  }
}
