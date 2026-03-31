import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "SOURCE_SUPABASE_URL",
  "SOURCE_SUPABASE_SERVICE_ROLE_KEY",
  "TARGET_SUPABASE_URL",
  "TARGET_SUPABASE_SERVICE_ROLE_KEY",
];

function stripQuotes(value) {
  const trimmed = String(value ?? "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeSupabaseUrl(rawValue, envName) {
  const value = stripQuotes(rawValue);
  if (!value) throw new Error(`Missing required env var: ${envName}`);

  // Allow dashboard project URL input and convert to API URL automatically.
  const dashboardMatch = value.match(
    /^https?:\/\/supabase\.com\/dashboard\/project\/([a-z0-9]+)(?:\/.*)?$/i,
  );
  if (dashboardMatch) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid ${envName}. Expected https://<project-ref>.supabase.co or dashboard project URL.`,
    );
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function normalizeServiceRoleKey(rawValue, envName) {
  const value = stripQuotes(rawValue);
  if (!value) throw new Error(`Missing required env var: ${envName}`);
  if (!value.startsWith("eyJ")) {
    throw new Error(
      `Invalid ${envName}. Use the project service_role JWT key from Supabase API settings.`,
    );
  }
  return value;
}

for (const key of requiredEnv) {
  if (!stripQuotes(process.env[key])) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const dryRun = process.argv.includes("--dry-run");
const pageSize = 500;
const sourceUrl = normalizeSupabaseUrl(
  process.env.SOURCE_SUPABASE_URL,
  "SOURCE_SUPABASE_URL",
);
const sourceServiceRoleKey = normalizeServiceRoleKey(
  process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY,
  "SOURCE_SUPABASE_SERVICE_ROLE_KEY",
);
const targetUrl = normalizeSupabaseUrl(
  process.env.TARGET_SUPABASE_URL,
  "TARGET_SUPABASE_URL",
);
const targetServiceRoleKey = normalizeServiceRoleKey(
  process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY,
  "TARGET_SUPABASE_SERVICE_ROLE_KEY",
);

const source = createClient(
  sourceUrl,
  sourceServiceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const target = createClient(
  targetUrl,
  targetServiceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function listAllAuthUsers(client, label) {
  const users = [];
  let page = 1;

  while (true) {
    const baseUrl = label === "source" ? sourceUrl : targetUrl;
    const serviceKey = label === "source" ? sourceServiceRoleKey : targetServiceRoleKey;
    const endpoint = `${baseUrl}/auth/v1/admin/users?page=${page}&per_page=${pageSize}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
      },
    });

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      const bodyPreview = (await response.text()).slice(0, 220).replace(/\s+/g, " ");
      throw new Error(
        `${label} listUsers returned non-JSON response (status ${response.status}) from ${endpoint}. ` +
          `Body preview: ${bodyPreview}`,
      );
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        `${label} listUsers failed (status ${response.status}): ${JSON.stringify(payload)}`,
      );
    }

    const current = payload?.users ?? [];
    users.push(...current);
    if (current.length < pageSize) break;
    page += 1;
  }

  return users;
}

async function selectAllRows(client, table) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(from, to);
    if (error) throw new Error(`Read ${table} failed: ${error.message}`);

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function upsertRows(client, table, rows, onConflict) {
  if (rows.length === 0) return;
  for (const batch of chunk(rows, 200)) {
    const { error } = await client
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`Upsert ${table} failed: ${error.message}`);
  }
}

function normalizeEmail(value) {
  return (value || "").trim().toLowerCase();
}

function randomPassword() {
  return `Temp#${Math.random().toString(36).slice(2)}${Date.now()}`;
}

async function main() {
  console.log(`Starting user/admin migration${dryRun ? " (dry-run)" : ""}...`);

  const [sourceUsers, targetUsers] = await Promise.all([
    listAllAuthUsers(source, "source"),
    listAllAuthUsers(target, "target"),
  ]);

  const targetByEmail = new Map();
  for (const u of targetUsers) {
    const email = normalizeEmail(u.email);
    if (email) targetByEmail.set(email, u);
  }

  const idMap = new Map(); // old auth user id -> new auth user id
  let createdUsers = 0;
  let reusedUsers = 0;

  for (const oldUser of sourceUsers) {
    const email = normalizeEmail(oldUser.email);
    if (!email) continue;

    let targetUser = targetByEmail.get(email);

    if (!targetUser && !dryRun) {
      const { data, error } = await target.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: Boolean(oldUser.email_confirmed_at),
        user_metadata: oldUser.user_metadata ?? {},
        app_metadata: oldUser.app_metadata ?? {},
        ban_duration: oldUser.banned_until ? "876000h" : "none",
      });
      if (error) throw new Error(`Create user ${email} failed: ${error.message}`);
      targetUser = data.user;
      createdUsers += 1;
      targetByEmail.set(email, targetUser);
    } else if (targetUser) {
      reusedUsers += 1;
    }

    if (targetUser?.id) idMap.set(oldUser.id, targetUser.id);
  }

  const [clients, profiles, userRoles, userWorkspaceClients] = await Promise.all([
    selectAllRows(source, "clients"),
    selectAllRows(source, "profiles"),
    selectAllRows(source, "user_roles"),
    selectAllRows(source, "user_workspace_clients"),
  ]);

  const migratedProfiles = profiles
    .map((row) => {
      const mappedId = idMap.get(row.id);
      if (!mappedId) return null;
      return { ...row, id: mappedId };
    })
    .filter(Boolean);

  const migratedUserRoles = userRoles
    .map((row) => {
      const mappedUserId = idMap.get(row.user_id);
      if (!mappedUserId) return null;
      return { ...row, user_id: mappedUserId };
    })
    .filter(Boolean);

  const migratedWorkspaceMap = userWorkspaceClients
    .map((row) => {
      const mappedUserId = idMap.get(row.user_id);
      if (!mappedUserId) return null;
      return { ...row, user_id: mappedUserId };
    })
    .filter(Boolean);

  if (dryRun) {
    console.log("Dry-run complete.");
    console.log(
      JSON.stringify(
        {
          sourceAuthUsers: sourceUsers.length,
          targetAuthUsersBefore: targetUsers.length,
          authUsersToCreate: sourceUsers.filter(
            (u) => normalizeEmail(u.email) && !targetByEmail.has(normalizeEmail(u.email)),
          ).length,
          clients: clients.length,
          profiles: migratedProfiles.length,
          user_roles: migratedUserRoles.length,
          user_workspace_clients: migratedWorkspaceMap.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  await upsertRows(target, "clients", clients, "id");
  await upsertRows(target, "profiles", migratedProfiles, "id");
  await upsertRows(target, "user_roles", migratedUserRoles, "id");
  await upsertRows(target, "user_workspace_clients", migratedWorkspaceMap, "user_id");

  console.log("Migration complete.");
  console.log(
    JSON.stringify(
      {
        createdUsers,
        reusedUsers,
        clients: clients.length,
        profiles: migratedProfiles.length,
        user_roles: migratedUserRoles.length,
        user_workspace_clients: migratedWorkspaceMap.length,
      },
      null,
      2,
    ),
  );
  console.log("Note: migrated users are created with temporary passwords.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
