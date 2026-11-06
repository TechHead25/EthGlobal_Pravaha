/**
 * Operator-only administrator provisioning.
 *
 *   npm run admin:grant -- --email person@example.org --reason "Initial operator"
 *   npm run admin:grant -- --email person@example.org --revoke --reason "Offboarding"
 *
 * Requires direct DATABASE_URL access (i.e. infrastructure access). The user must have signed in
 * with Google at least once. Every change is written to the audit log with actorId = null
 * and `via: "operator_cli"`. There is intentionally no web or API path to grant ADMIN.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const reason = arg("reason")?.trim();
  const revoke = process.argv.includes("--revoke");
  if (!email || !reason || reason.length < 5) {
    console.error('Usage: npm run admin:grant -- --email <email> --reason "<why>" [--revoke]');
    process.exit(2);
  }
  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) throw new Error(`No account for ${email}. The person must sign in with Google first.`);

    if (revoke) {
      const res = await db.roleGrant.updateMany({
        where: { userId: user.id, role: "ADMIN", revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason },
      });
      await db.auditEvent.create({ data: { actorId: null, action: "role.revoked", targetType: "User", targetId: user.id, metadata: { role: "ADMIN", reason, via: "operator_cli" } } });
      console.log(res.count ? `Revoked ADMIN from ${email}.` : `${email} did not hold ADMIN.`);
      return;
    }

    const existing = await db.roleGrant.findFirst({ where: { userId: user.id, role: "ADMIN", revokedAt: null } });
    if (existing) {
      console.log(`${email} already holds ADMIN.`);
      return;
    }
    await db.$transaction([
      db.roleGrant.create({ data: { userId: user.id, role: "ADMIN", grantedById: null, reason } }),
      db.auditEvent.create({ data: { actorId: null, action: "role.granted", targetType: "User", targetId: user.id, metadata: { role: "ADMIN", reason, via: "operator_cli" } } }),
    ]);
    console.log(`Granted ADMIN to ${email}. The change applies on their next request.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
