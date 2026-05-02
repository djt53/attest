import { requireDb } from "./connection.js";

export async function checkAndRecordJTI(
  jti: string,
  expiresAt: Date
): Promise<boolean> {
  const db = requireDb();
  try {
    await db`
      INSERT INTO seen_jtis (jti, expires_at)
      VALUES (${jti}, ${expiresAt})
    `;
    return false; // Not a replay
  } catch (err: unknown) {
    // Unique constraint violation = replay
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return true; // Replay detected
    }
    throw err;
  }
}

export async function cleanExpiredJTIs(): Promise<number> {
  const db = requireDb();
  const result = await db`
    DELETE FROM seen_jtis WHERE expires_at < now()
  `;
  return result.count;
}
