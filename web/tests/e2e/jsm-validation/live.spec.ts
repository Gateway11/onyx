import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { JsmSetupPage } from "../pages/JsmSetupPage";

const source = "jira_service_management";

// Use fetch so Playwright does not record credential requests in its reports.
async function api(method: string, path: string, data?: unknown) {
  const auth = JSON.parse(readFileSync("jsm-auth.json", "utf8"));
  const cookie = auth.cookies
    .map((item: { name: string; value: string }) => `${item.name}=${item.value}`)
    .join("; ");
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:3000/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error(`Onyx ${method} request failed`);
  }
  if (!response.ok) throw new Error(`Onyx ${method} returned HTTP ${response.status}`);
  return response.json();
}

async function jira(method: string, path: string, data?: unknown) {
  let response: Response;
  try {
    response = await fetch(`${process.env.JSM_BASE_URL}/rest/api/3${path}`, {
      method,
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${process.env.JSM_USER_EMAIL}:${process.env.JSM_API_TOKEN}`).toString("base64")}`,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error(`Jira ${method} request failed`);
  }
  if (!response.ok) throw new Error(`Jira ${method} returned HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function search(query: string) {
  const result = await api("POST", "/search/send-search-message", {
    search_query: query,
    filters: { source_type: [source] },
    stream: false,
    include_content: true,
    run_query_expansion: false,
    num_docs_fed_to_llm_selection: 0,
  });
  if (result.error) throw new Error("Onyx search failed");
  return result.search_docs;
}

function description(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

test("real JSM tickets are indexed and searchable", async ({ page }, testInfo) => {
  test.skip(!process.env.JSM_API_TOKEN, "Live JSM credentials were not provided");
  test.setTimeout(1_800_000);
  for (const name of ["JSM_BASE_URL", "JSM_USER_EMAIL", "JSM_PROJECT_KEY"]) {
    if (!process.env[name]) throw new Error(`Missing ${name}`);
  }
  await api("POST", "/manage/credential", {
    name: "JSM acceptance credential",
    credential_json: {
      jira_user_email: process.env.JSM_USER_EMAIL,
      jira_api_token: process.env.JSM_API_TOKEN,
    },
    source,
    admin_public: true,
    curator_public: false,
    groups: [],
  });
  const setup = new JsmSetupPage(page);
  await setup.createProject(
    process.env.JSM_BASE_URL!,
    process.env.JSM_PROJECT_KEY!,
    testInfo.outputPath("jsm-configuration.png"),
  );
  await expect
    .poll(
      async () => {
        const groups = await api("POST", "/manage/admin/connector/indexing-status", {
          get_all_connectors: true,
        });
        const status = groups
          .flatMap(
            (group: {
              indexing_statuses: Array<{
                cc_pair_id: number;
                name: string;
                last_finished_status: string;
                docs_indexed: number;
              }>;
            }) => group.indexing_statuses,
          )
          .find((item: { name: string }) => item.name === "JSM acceptance project");
        if (status?.last_finished_status === "failed") throw new Error("JSM indexing failed");
        return status?.last_finished_status === "success" && status.docs_indexed >= 2;
      },
      { timeout: 720_000, intervals: [10_000] },
    )
    .toBe(true);
  const referenceResponse = await jira("GET", `/search/jql?${new URLSearchParams({
    jql: `project = "${process.env.JSM_PROJECT_KEY}"`, maxResults: "1", fields: "summary",
  })}`);
  const reference = referenceResponse.issues[0];
  if (!reference) throw new Error("The test project has no tickets");
  const results = await api("POST", "/search/send-search-message", {
    search_query: reference.fields.summary,
    filters: { source_type: [source] },
    stream: false,
    run_query_expansion: false,
    num_docs_fed_to_llm_selection: 0,
  });
  expect(results.error).toBeFalsy();
  expect(results.search_docs.length).toBeGreaterThanOrEqual(1);
  expect(results.search_docs.some((doc: { link: string }) => doc.link?.endsWith(`/browse/${reference.key}`))).toBe(true);
  for (const doc of results.search_docs) expect(doc.source_type).toBe(source);
  await setup.expectIndexedProject();
  const pairs = await api("GET", "/manage/admin/connector/status");
  const pair = pairs.find((item: { name: string }) => item.name === "JSM acceptance project");
  if (!pair) throw new Error("Created connector was not found");
  const sync = () =>
    api("POST", "/manage/admin/connector/run-once", {
      connector_id: pair.connector.id,
      credential_ids: [pair.credential.id],
      from_beginning: false,
    });
  const marker = `onyxjsm${Date.now()}`;
  const project = await jira("GET", `/project/${process.env.JSM_PROJECT_KEY}`);
  const issueType = project.issueTypes.find((item: { subtask: boolean }) => !item.subtask);
  if (!issueType) throw new Error("The project has no standard issue type");
  let temporaryIssue: string | undefined;
  try {
    const created = await jira("POST", "/issue", {
      fields: {
        project: { key: process.env.JSM_PROJECT_KEY },
        issuetype: { id: issueType.id },
        summary: `Onyx connector acceptance ${marker}`,
        description: description(`${marker} initial description`),
      },
    });
    temporaryIssue = created.key;
    writeFileSync(
      testInfo.outputPath("temporary-issue.json"),
      JSON.stringify({ key: temporaryIssue, marker }),
    );
    await sync();
    await expect
      .poll(
        async () => {
          const docs = await search(marker);
          return docs.some((doc: { content: string }) =>
            doc.content?.includes(`${marker} initial description`),
          );
        },
        { timeout: 300_000, intervals: [10_000] },
      )
      .toBe(true);
    await jira("PUT", `/issue/${temporaryIssue}?notifyUsers=false`, {
      fields: {
        description: description(`${marker} updated description`),
      },
    });
    await sync();
    await expect
      .poll(
        async () => {
          const docs = await search(marker);
          return docs.some((doc: { content: string }) =>
            doc.content?.includes(`${marker} updated description`),
          );
        },
        { timeout: 300_000, intervals: [10_000] },
      )
      .toBe(true);
    await jira("DELETE", `/issue/${temporaryIssue}`);
    temporaryIssue = undefined;
    await api("POST", `/manage/admin/cc-pair/${pair.cc_pair_id}/prune`);
    await expect
      .poll(async () => (await search(marker)).length, { timeout: 300_000, intervals: [10_000] })
      .toBe(0);
    await testInfo.attach("acceptance-results", {
      body: JSON.stringify({
        initialIndex: true,
        incrementalAdd: true,
        incrementalUpdate: true,
        pruning: true,
      }),
      contentType: "application/json",
    });
  } finally {
    if (temporaryIssue) await jira("DELETE", `/issue/${temporaryIssue}`);
  }
});
