import { request } from "@playwright/test";

export default async function setup() {
  const context = await request.newContext({ baseURL: "http://127.0.0.1:3000" });
  const email = "admin_user@example.com";
  const password = "TestPassword123!";
  try {
    const registration = await context.post("/api/auth/register", {
      data: { email, username: email, password },
    });
    if (!registration.ok()) throw new Error(`Test registration returned ${registration.status()}`);
    const login = await context.post("/api/auth/login", { form: { username: email, password } });
    if (!login.ok()) throw new Error(`Test login returned ${login.status()}`);
    await context.storageState({ path: "jsm-auth.json" });
    await context.patch("/api/user/personalization", { data: { name: "JSM Test Admin" } });
  } finally {
    await context.dispose();
  }
}
