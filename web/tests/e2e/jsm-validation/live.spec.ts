import { expect, test } from "@playwright/test";
import { JsmSetupPage } from "../pages/JsmSetupPage";

const source = "jira_service_management";

// Use fetch so Playwright does not record credential requests in its reports.
async function api(method: string, path: string, data?: unknown) {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:3000/api${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error(`Onyx ${method} request failed`);
  }
  if (!response.ok) throw new Error(`Onyx ${method} returned HTTP ${response.status}`);
  return response.json();
}

test("real JSM tickets are indexed and searchable", async ({ page }) => {
  test.skip(!process.env.JSM_API_TOKEN, "Live JSM credentials were not provided");
  test.setTimeout(900_000);
  for (const name of ["JSM_BASE_URL", "JSM_USER_EMAIL", "JSM_PROJECT_KEY"]) {
    if (!process.env[name]) throw new Error(`Missing ${name}`);
  }
  const credential = await api("POST", "/manage/credential", {
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
  const connector = await api("POST", "/manage/admin/connector", {
    name: "JSM acceptance project",
    source,
    input_type: "poll",
    connector_specific_config: {
      jira_base_url: process.env.JSM_BASE_URL,
      project_key: process.env.JSM_PROJECT_KEY,
    },
    access_type: "public",
    groups: [],
    refresh_freq: null,
  });
  const pair = await api("PUT", `/manage/connector/${connector.id}/credential/${credential.id}`, {
    name: "JSM acceptance project",
    access_type: "public",
    groups: [],
  });
  await api("POST", "/manage/admin/connector/run-once", {
    connector_id: connector.id,
    credential_ids: [credential.id],
    from_beginning: false,
  });
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
                last_finished_status: string;
                docs_indexed: number;
              }>;
            }) => group.indexing_statuses,
          )
          .find((item: { cc_pair_id: number }) => item.cc_pair_id === Number(pair.data));
        if (status?.last_finished_status === "failed") throw new Error("JSM indexing failed");
        return status?.last_finished_status === "success" && status.docs_indexed >= 2;
      },
      { timeout: 720_000, intervals: [10_000] },
    )
    .toBe(true);
  const results = await api("POST", "/search/send-search-message", {
    search_query: process.env.JSM_PROJECT_KEY,
    filters: { source_type: [source] },
    stream: false,
    run_query_expansion: false,
    num_docs_fed_to_llm_selection: 0,
  });
  expect(results.error).toBeFalsy();
  expect(results.search_docs.length).toBeGreaterThanOrEqual(2);
  for (const doc of results.search_docs) expect(doc.source_type).toBe(source);
  await new JsmSetupPage(page).expectIndexedProject();
});
