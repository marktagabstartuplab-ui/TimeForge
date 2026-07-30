/* eslint-disable */
// Recomputes LeaveRequest.days for rows where it disagrees with the stored date
// range.
//
// returnFromLeave used to shorten endDate without recomputing days, so a leave
// ended early kept the duration of the range originally requested — a 2-day
// range reading "11 day(s)". The service now recomputes on return; this repairs
// rows written before that.
//
// Usage:
//   node scripts/repair-leave-request-days.js           (dry run)
//   node scripts/repair-leave-request-days.js --apply   (writes)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');

/** Inclusive business-day count — mirrors LeaveService.computeDays. */
function businessDays(start, end) {
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.leaveRequest.findMany({
      where: { deletedAt: null },
      select: { id: true, status: true, startDate: true, endDate: true, days: true },
      orderBy: { createdAt: 'desc' },
    });

    const mismatched = rows
      .map((r) => ({ r, actual: businessDays(r.startDate, r.endDate) }))
      .filter(({ r, actual }) => Number(r.days) !== actual);

    console.log(`leave requests: ${rows.length} | days mismatch: ${mismatched.length}\n`);
    for (const { r, actual } of mismatched) {
      console.log(
        `${r.id} ${r.status}  ${r.startDate.toISOString().slice(0, 10)} -> ${r.endDate.toISOString().slice(0, 10)}` +
        `  days ${r.days} -> ${actual}`,
      );
    }

    if (mismatched.length === 0) {
      console.log('Nothing to repair.');
      return;
    }
    if (!APPLY) {
      console.log('\nDry run — nothing written. Re-run with --apply to commit.');
      return;
    }

    for (const { r, actual } of mismatched) {
      await prisma.leaveRequest.update({
        where: { id: r.id },
        // Deliberately not bumping version: this corrects a stored value to match
        // the row's own dates, and bumping it would 409 anyone holding the record.
        data: { days: actual },
      });
    }
    console.log(`\n✓ Repaired ${mismatched.length} leave request(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
