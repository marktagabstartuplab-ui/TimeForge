/* eslint-disable */
// Repoints pre-existing LEAVE notifications at their specific leave request.
//
// Notifications created before the deep-link fix stored a bare actionUrl
// ("/dashboard", "/supervisor/leave") and an empty metadata object, so there is
// no stored reference to recover — each row has to be matched back to its
// request by recipient and timestamp. Notifications created after the fix
// carry metadata.leaveRequestId and are matched directly from that.
//
// Usage:
//   node scripts/backfill-leave-notification-links.js            (dry run)
//   node scripts/backfill-leave-notification-links.js --apply    (writes)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
// How far apart a notification and its triggering request may be. Both are
// written in the same request handler, so the real gap is milliseconds; 60s is
// slack for clock skew, not a fuzzy search window.
const MAX_SKEW_MS = 60_000;

/** Which leave-request timestamp each notification kind lines up with. */
const KINDS = [
  {
    match: (n) => n.actionLabel === 'Review Request',
    // Sent to the supervisor; senderId is the requester. Pairs with creation.
    requesterId: (n) => n.senderId,
    stamp: (r) => r.createdAt,
    url: (id) => `/supervisor/leave?leaveRequest=${id}`,
  },
  {
    match: (n) => n.actionLabel === 'View Leave Log',
    // Sent to supervisor + HR on an early return; senderId is the requester.
    requesterId: (n) => n.senderId,
    stamp: (r) => r.updatedAt,
    url: (id) => `/supervisor/leave?leaveRequest=${id}`,
  },
  {
    match: (n) => n.actionLabel === 'View Details',
    // Sent to the requester themselves. Pairs with the approve/reject.
    requesterId: (n) => n.userId,
    stamp: (r) => r.reviewedAt,
    url: (id) => `/dashboard?leaveRequest=${id}`,
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const notifications = await prisma.notification.findMany({
      where: { category: 'LEAVE', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, userId: true, senderId: true, title: true,
        actionLabel: true, actionUrl: true, metadata: true, createdAt: true,
      },
    });

    const requests = await prisma.leaveRequest.findMany({
      where: { deletedAt: null },
      select: { id: true, userId: true, createdAt: true, updatedAt: true, reviewedAt: true },
    });
    const byUser = new Map();
    for (const r of requests) {
      if (!byUser.has(r.userId)) byUser.set(r.userId, []);
      byUser.get(r.userId).push(r);
    }

    const planned = [];
    const skipped = [];

    for (const n of notifications) {
      if (n.actionUrl && n.actionUrl.includes('leaveRequest=')) {
        skipped.push({ n, why: 'already deep-linked' });
        continue;
      }

      const kind = KINDS.find((k) => k.match(n));
      if (!kind) {
        skipped.push({ n, why: `unrecognised actionLabel ${JSON.stringify(n.actionLabel)}` });
        continue;
      }

      // Post-fix rows carry the id outright; prefer it over any guessing.
      const stored = n.metadata && n.metadata.leaveRequestId;
      if (stored) {
        planned.push({ n, requestId: stored, skewMs: 0, source: 'metadata' });
        continue;
      }

      const ownerId = kind.requesterId(n);
      if (!ownerId) {
        skipped.push({ n, why: 'no senderId to identify the requester' });
        continue;
      }

      const candidates = (byUser.get(ownerId) ?? [])
        .map((r) => ({ r, stamp: kind.stamp(r) }))
        .filter((c) => c.stamp)
        .map((c) => ({ ...c, skew: Math.abs(c.stamp.getTime() - n.createdAt.getTime()) }))
        .filter((c) => c.skew <= MAX_SKEW_MS)
        .sort((a, b) => a.skew - b.skew);

      if (candidates.length === 0) {
        skipped.push({ n, why: 'no leave request within the time window' });
        continue;
      }
      // Two requests for the same user seconds apart would make the pairing a
      // coin flip — leave those alone rather than link the wrong record.
      if (candidates.length > 1 && candidates[1].skew === candidates[0].skew) {
        skipped.push({ n, why: 'ambiguous — two equally close requests' });
        continue;
      }

      planned.push({ n, requestId: candidates[0].r.id, skewMs: candidates[0].skew, source: 'matched' });
    }

    console.log(`LEAVE notifications: ${notifications.length}`);
    console.log(`  to update: ${planned.length}`);
    console.log(`  skipped:   ${skipped.length}\n`);

    for (const p of planned) {
      const kind = KINDS.find((k) => k.match(p.n));
      console.log(
        `UPDATE ${p.n.createdAt.toISOString()} "${p.n.title}"\n` +
        `   ${p.n.actionUrl}  ->  ${kind.url(p.requestId)}\n` +
        `   via ${p.source}${p.source === 'matched' ? ` (${p.skewMs}ms apart)` : ''}`,
      );
    }
    if (skipped.length) {
      console.log('');
      for (const s of skipped) {
        console.log(`SKIP   ${s.n.createdAt.toISOString()} "${s.n.title}" — ${s.why}`);
      }
    }

    if (!APPLY) {
      console.log('\nDry run — nothing written. Re-run with --apply to commit these updates.');
      return;
    }

    let written = 0;
    for (const p of planned) {
      const kind = KINDS.find((k) => k.match(p.n));
      await prisma.notification.update({
        where: { id: p.n.id },
        data: {
          actionUrl: kind.url(p.requestId),
          metadata: { ...(p.n.metadata ?? {}), leaveRequestId: p.requestId },
        },
      });
      written += 1;
    }
    console.log(`\n✓ Updated ${written} notification(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
