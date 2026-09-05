import { expect, Page } from "@playwright/test";

export class JsmSetupPage {
  constructor(private readonly page: Page) {}

  async openFromCatalog() {
    await this.page.goto("/admin/add-connector");
    await this.page.getByText("Jira Service Management", { exact: true }).click();
    await expect(this.page).toHaveURL(/\/admin\/connectors\/jira_service_management/);
  }

  async createProject(baseUrl: string, projectKey: string, screenshotPath: string) {
    await this.openFromCatalog();
    await this.page
      .getByRole("row")
      .filter({ hasText: "JSM acceptance credential" })
      .getByRole("radio")
      .check();
    await this.page.getByRole("button", { name: "Continue", exact: true }).click();
    await this.page.getByLabel("Connector Name", { exact: true }).fill("JSM acceptance project");
    await this.page.getByLabel("Jira Base URL", { exact: true }).fill(baseUrl);
    await this.page.getByLabel("Service Project Key", { exact: true }).fill(projectKey);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    await this.page.getByRole("button", { name: "Create Connector", exact: true }).click();
    await expect(this.page).toHaveURL(/\/admin\/indexing\/status/, { timeout: 120_000 });
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
