# TimeForge Feature Build Prompts

Build new features for TimeForge using the same structured approach as bug fixes. **One feature at a time** to prevent cascading issues.

**Total Scope:** 6 features, 6-10 weeks

---

## Shared Rules (Paste at Start of Each Feature)

```
BEFORE I START CODING:

1. Scope & Safety:
   ☐ I've identified all files I will create/modify
   ☐ I've noted which files are OFF-LIMITS (do not touch)
   ☐ I have a rollback plan if something breaks
   ☐ No breaking changes to existing APIs
   ☐ No permission/RBAC conflicts

2. Database & Migrations:
   ☐ Schema changes use Prisma migrations (no hand-edits)
   ☐ Migration includes rollback (DOWN)
   ☐ Test migration on fresh DB
   ☐ Seed data included if needed

3. Implementation Order:
   ☐ Database schema first
   ☐ API endpoints second
   ☐ Frontend UI third
   ☐ Tests fourth

4. Verification:
   ☐ Feature works end-to-end
   ☐ Tests pass (`npm run test`)
   ☐ No console errors
   ☐ Permissions enforced
   ☐ Verification checklist complete

5. Documentation:
   ☐ Code changes summarized
   ☐ Other features that may be affected noted
   ☐ Testing notes included
```

---

## FEAT-1: Bug Tracking Module

**Estimated Time:** 1-2 weeks  
**Priority:** HIGH (isolated, new, high value)  
**Dependencies:** None

### Feature Overview
Integrated bug reporting and tracking system. Employees report bugs, admins manage workflow.

**Quick Scope:**
- Report bugs (all roles)
- View bug list (admin/supervisor)
- Change status + assign (admin only)
- Add comments (all roles)
- Attach files (all roles)

### Database Schema

```sql
-- Create migrations: `npx prisma migrate dev --name add_bug_tracking`

CREATE TABLE bugs (
  id UUID PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  issue TEXT NOT NULL,
  who_affected TEXT NOT NULL,
  what_i_see TEXT NOT NULL,
  expected TEXT NOT NULL,
  error_message TEXT,
  where_it_happens VARCHAR(255) NOT NULL,
  
  status ENUM('OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'BLOCKED'),
  priority ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'),
  severity ENUM('P0', 'P1', 'P2', 'P3', 'P4'),
  
  reported_by UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP,
  resolved_at TIMESTAMP,
  
  organization_id UUID REFERENCES organizations(id)
);

CREATE TABLE bug_attachments (
  id UUID PRIMARY KEY,
  bug_id UUID REFERENCES bugs(id) ON DELETE CASCADE,
  file_url VARCHAR(255),
  file_name VARCHAR(255),
  file_size INT,
  created_at TIMESTAMP
);

CREATE TABLE bug_comments (
  id UUID PRIMARY KEY,
  bug_id UUID REFERENCES bugs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMP
);

CREATE TABLE bug_activity_log (
  id UUID PRIMARY KEY,
  bug_id UUID REFERENCES bugs(id) ON DELETE CASCADE,
  action VARCHAR(100),
  old_value VARCHAR(255),
  new_value VARCHAR(255),
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMP
);
```

### API Endpoints

```
POST   /api/bugs                 — Create bug report
GET    /api/bugs                 — List bugs (filtered by role)
GET    /api/bugs/:id             — Get bug detail
PATCH  /api/bugs/:id             — Update status/priority/assignment
DELETE /api/bugs/:id             — Delete bug (admin only)

POST   /api/bugs/:id/comments    — Add comment
POST   /api/bugs/:id/attachments — Upload file
GET    /api/bugs/:id/activity    — Get activity log

GET    /api/bugs/stats           — Dashboard stats
```

### Frontend Components

```
Location: apps/web/app/bugs/
├── page.tsx              (Bug list + filters)
├── [id]/page.tsx         (Bug detail view)
├── create/page.tsx       (Report bug form)
└── components/
    ├── BugCard.tsx       (Card component)
    ├── BugForm.tsx       (Reporting form)
    ├── StatusBadge.tsx   (Status selector)
    └── CommentThread.tsx (Comments section)

Sidebar: Add to all role sidebars:
└─ SUPPORT
   ├─ Report a Bug
   └─ View Submitted Issues (admin only)
```

### Do Not Touch

- ❌ Existing API endpoints (don't modify /time-entries, /timesheets, etc.)
- ❌ Permission system (don't change @RequirePermissions)
- ❌ User authentication
- ❌ Notification system (bug tracking uses existing notifications)
- ❌ Existing sidebar structure (only add SUPPORT section if not exists)

### Verification Checklist

**Functional:**
- [ ] Can report bug (all roles)
- [ ] Bug list shows only bugs reporter is allowed to see
- [ ] Admin can change status, assign to self
- [ ] Can add comments
- [ ] Can upload attachments (< 10MB)
- [ ] Activity log shows all changes
- [ ] Deleting bug cascades to attachments/comments

**Database:**
- [ ] Migration runs cleanly
- [ ] All fields persist correctly
- [ ] Rollback migration works

**Permissions:**
- [ ] Non-admins cannot delete bugs
- [ ] Non-admins cannot assign bugs
- [ ] Non-admins cannot change priority

**Testing:**
- [ ] `npm run test` passes (bugs module)
- [ ] No console errors
- [ ] Mobile responsive

### Success Criteria

✅ 100% bug reports completed end-to-end
✅ Admin dashboard shows all open bugs
✅ Email notification on assignment
✅ Zero permission leaks
✅ < 2s page load

---

## FEAT-2: Time Clock Shift Limits

**Estimated Time:** 1 week  
**Priority:** MEDIUM (standalone, quick win)  
**Dependencies:** None

### Feature Overview
Enforce maximum 12-hour shift duration with auto-clock-out and supervisor override workflow.

**Quick Scope:**
- Auto-clock-out at 12 hours
- Warning alerts at 11+ hours
- Supervisor override workflow
- Overtime tracking
- Audit log for violations

### Database Schema

```sql
CREATE TABLE shift_configurations (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  
  shift_name VARCHAR(50),
  max_shift_duration DECIMAL(5,2),
  grace_period_minutes INT,
  requires_supervisor_override BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP
);

ALTER TABLE time_clock_sessions ADD COLUMN (
  is_auto_clocked_out BOOLEAN DEFAULT false,
  auto_clock_out_reason VARCHAR(100),
  
  requires_override BOOLEAN DEFAULT false,
  supervisor_override_id UUID REFERENCES users(id),
  override_approved BOOLEAN,
  override_approved_at TIMESTAMP
);

CREATE TABLE shift_limit_violations (
  id UUID PRIMARY KEY,
  time_clock_session_id UUID REFERENCES time_clock_sessions(id),
  employee_id UUID REFERENCES users(id),
  
  violation_type ENUM('REACHED_LIMIT', 'AUTO_CLOCKED_OUT', 'MANUAL_OVERRIDE'),
  violation_time TIMESTAMP,
  hours_worked_at_violation DECIMAL(5,2),
  
  supervisor_action ENUM('APPROVED', 'DENIED', 'NO_ACTION'),
  supervisor_action_time TIMESTAMP,
  
  created_at TIMESTAMP
);
```

### Backend Logic

```typescript
// apps/api/src/modules/time-clock/time-clock.service.ts

// 1. At clock-in: fetch shift config, calculate max clock-out time
clockIn(employeeId, shiftConfigId) {
  const config = getShiftConfig(shiftConfigId);
  const maxClockOut = addHours(now(), config.max_shift_duration);
  // Store maxClockOut in time_clock_sessions
}

// 2. On status check (every 5 min or real-time):
checkShiftDuration(sessionId) {
  const elapsed = now() - session.clock_in_time;
  
  if (elapsed >= 12 hours) {
    autoClockOut(sessionId); // Hard limit
  } else if (elapsed >= 11 hours) {
    sendWarningNotification(sessionId); // Soft warning
  }
}

// 3. Auto-clock-out at 12 hours
autoClockOut(sessionId) {
  session.clock_out_time = clock_in_time + 12 hours;
  session.is_auto_clocked_out = true;
  session.auto_clock_out_reason = '12-hour limit reached';
  notifyEmployee('You were auto-clocked at 12 hours');
  notifySupervisor('Employee auto-clocked');
}

// 4. Supervisor override workflow
requestOverride(sessionId, additionalHours) {
  violation = createViolation(sessionId);
  sendToSupervisor('Employee requests ' + additionalHours + ' hrs extension');
}

approveOverride(violationId, additionalHours) {
  violation.supervisor_action = 'APPROVED';
  violation.supervisor_action_time = now();
  // Employee can continue clocking until new deadline
}
```

### Frontend Components

```
Location: apps/web/app/time-clock/
├── page.tsx              (Time clock UI + warnings)
├── components/
    ├── ShiftStatusBar.tsx (Progress bar showing 12-hr usage)
    ├── WarningAlert.tsx   (Warning at 11+ hrs)
    └── OverrideRequest.tsx (Request form)
```

### Do Not Touch

- ❌ Existing clock in/out endpoints
- ❌ Payroll calculation (don't modify yet)
- ❌ Timesheet approval workflow
- ❌ Notification system

### Verification Checklist

**Functional:**
- [ ] Timer progresses correctly
- [ ] Warning appears at 11 hours
- [ ] Auto-clock-out triggers at exactly 12 hours
- [ ] Supervisor receives override request
- [ ] Supervisor can approve/deny extension
- [ ] Employee can continue if approved
- [ ] Audit log records all violations

**Database:**
- [ ] Migration runs cleanly
- [ ] shift_configurations has seed data

**Testing:**
- [ ] `npm run test` passes (time-clock module)
- [ ] Test scenario: 12-hour clock-in triggers auto-clock-out
- [ ] Test scenario: Supervisor override extends by 1 hour

### Success Criteria

✅ Zero shifts > 12 hours without approval
✅ Audit log 100% accurate
✅ Zero broken existing clock functionality
✅ Supervisor notifications working

---

## FEAT-3: Enhanced Payroll (2026 Philippine Compliance)

**Estimated Time:** 3-4 weeks  
**Priority:** CRITICAL (complex, high value, blocking FEAT-4)  
**Dependencies:** None (but FEAT-4 depends on this)

### Feature Overview
Auto-calculate 2026 Philippine taxes (BIR, SSS, PhilHealth, Pag-IBIG) and generate payslips.

**Quick Scope:**
- BIR income tax withholding (progressive rates)
- SSS contribution (5% employee, 10% employer)
- PhilHealth (2.5% each, min/max caps)
- Pag-IBIG (1-2% with employee cap)
- Holiday pay rates (1.00x, 2.00x, 1.30x)
- Payslip generation
- Monthly/annual reports

### Database Schema

```sql
CREATE TABLE payroll_settings (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  
  -- Contribution rates (2026)
  sss_employee_rate DECIMAL(5,3) DEFAULT 0.05,
  sss_employer_rate DECIMAL(5,3) DEFAULT 0.10,
  sss_salary_ceiling DECIMAL(10,2) DEFAULT 29500,
  
  philhealth_employee_rate DECIMAL(5,3) DEFAULT 0.025,
  philhealth_employer_rate DECIMAL(5,3) DEFAULT 0.025,
  philhealth_min DECIMAL(10,2) DEFAULT 500,
  philhealth_max DECIMAL(10,2) DEFAULT 5000,
  
  pagibig_employee_rate_low DECIMAL(5,3) DEFAULT 0.01,
  pagibig_employee_rate_high DECIMAL(5,3) DEFAULT 0.02,
  pagibig_salary_threshold DECIMAL(10,2) DEFAULT 1500,
  pagibig_employee_cap DECIMAL(10,2) DEFAULT 200,
  
  overtime_rate_multiplier DECIMAL(3,2) DEFAULT 1.25,
  night_shift_premium DECIMAL(3,2) DEFAULT 1.10,
  
  bir_tax_table_year INT DEFAULT 2026,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE bir_tax_tables (
  id UUID PRIMARY KEY,
  tax_year INT,
  
  bracket_1_min DECIMAL(12,2),
  bracket_1_max DECIMAL(12,2),
  bracket_1_rate DECIMAL(5,3),
  bracket_1_base DECIMAL(12,2),
  
  -- ... repeat for all 5 brackets
  
  is_active BOOLEAN,
  effective_date DATE,
  created_at TIMESTAMP
);

ALTER TABLE payroll_deductions ADD COLUMN (
  -- Gross components
  basic_salary DECIMAL(12,2),
  overtime_pay DECIMAL(12,2),
  night_differential DECIMAL(12,2),
  holiday_pay DECIMAL(12,2),
  
  -- Deductions
  sss_contribution DECIMAL(10,2),
  philhealth_contribution DECIMAL(10,2),
  pagibig_contribution DECIMAL(10,2),
  income_tax_withheld DECIMAL(10,2),
  
  -- Calculations
  gross_total DECIMAL(12,2),
  total_deductions DECIMAL(12,2),
  net_pay DECIMAL(12,2),
  ytd_taxable_income DECIMAL(12,2),
  
  is_thirteenth_month BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP
);
```

### Backend Services

```typescript
// apps/api/src/modules/payroll/bir-tax.service.ts
calculateIncomeTax(taxableIncome, yearToDateIncome) {
  // 2026 BIR Tax Table
  // First 250k: tax-free
  // 250k-400k: 15% on excess
  // etc.
  
  return {
    taxInThisPeriod: ...,
    yearToDateTax: ...
  };
}

// apps/api/src/modules/payroll/deduction.service.ts
calculateSSSContribution(grossSalary) {
  return Math.min(grossSalary, 29500) * 0.05; // Employee
}

calculatePhilHealthContribution(grossSalary) {
  const amount = grossSalary * 0.025;
  return Math.max(500, Math.min(5000, amount)); // Min/Max caps
}

calculatePagIBIGContribution(grossSalary) {
  let rate = 0.01; // Default
  if (grossSalary > 1500) rate = 0.02;
  
  const amount = grossSalary * rate;
  return Math.min(amount, 200); // Employee cap
}

// apps/api/src/modules/payroll/payroll.service.ts
generatePayslip(payrollId, deductionId) {
  const deduction = await deductionService.findOne(deductionId);
  
  // Build payslip with all components
  return generatePDF({
    employee: ...,
    earnings: ...,
    deductions: ...,
    netPay: ...,
    yearToDate: ...
  });
}
```

### API Endpoints

```
POST   /api/payroll/calculate    — Calculate monthly payroll
GET    /api/payroll/:id/slip     — Generate payslip PDF
GET    /api/payroll/reports/sss  — SSS remittance report
GET    /api/payroll/reports/bir  — BIR tax summary
```

### Do Not Touch

- ❌ User salary field (don't modify users table)
- ❌ Time tracking (clock in/out stays as-is)
- ❌ Existing payroll table structure
- ❌ Leave management (separate feature)

### Verification Checklist

**Tax Calculations:**
- [ ] BIR tax matches 2026 brackets exactly
- [ ] SSS: 5% employee, 10% employer, capped at ₱29,500
- [ ] PhilHealth: 2.5% each, min ₱500, max ₱5,000
- [ ] Pag-IBIG: 1-2% based on salary, employee capped at ₱200
- [ ] YTD calculations accumulate correctly

**Payslip:**
- [ ] Shows all earnings breakdown
- [ ] Shows all deductions breakdown
- [ ] Net pay = Gross - Deductions
- [ ] PDF renders correctly

**Database:**
- [ ] Migration includes 2026 BIR tax table seed
- [ ] Payroll settings have 2026 defaults

**Testing:**
- [ ] `npm run test` passes
- [ ] Test case: ₱20,000 salary → correct net pay
- [ ] Test case: ₱350,000 YTD income → correct tax bracket

### Success Criteria

✅ All deductions 100% accurate vs. 2026 BIR tables
✅ Payslips auto-generate for all employees
✅ YTD calculations never jump backward
✅ Zero tax underpayment

---

## FEAT-4: Leave Management (Service Incentive Leave + Vacation/Sick)

**Estimated Time:** 2 weeks  
**Priority:** HIGH (depends on FEAT-3, blocks FEAT-5)  
**Dependencies:** FEAT-3 (Payroll)

### Feature Overview
Mandatory SIL (5 days/year) with cash conversion, plus company leave (vacation/sick).

**Quick Scope:**
- SIL tracking (5 days/year, vested after 1 year)
- Unused SIL → cash conversion at year-end
- Vacation & sick leave (company policy)
- Leave requests & approvals
- Carryover rules
- Leave payslip integration

### Database Schema

```sql
CREATE TABLE leave_types (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  
  name VARCHAR(50),
  description TEXT,
  is_mandatory BOOLEAN,
  default_days_per_year INT,
  
  can_convert_to_cash BOOLEAN,
  carries_over BOOLEAN,
  carryover_limit INT,
  
  created_at TIMESTAMP
);

CREATE TABLE leave_balances (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  leave_type_id UUID REFERENCES leave_types(id),
  
  year INT,
  opening_balance DECIMAL(5,2),
  days_earned DECIMAL(5,2),
  days_used DECIMAL(5,2),
  days_available DECIMAL(5,2),
  ending_balance DECIMAL(5,2),
  
  cash_conversion_amount DECIMAL(10,2),
  cash_conversion_date DATE,
  
  created_at TIMESTAMP
);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  leave_type_id UUID REFERENCES leave_types(id),
  
  start_date DATE,
  end_date DATE,
  number_of_days DECIMAL(5,2),
  reason TEXT,
  
  status ENUM('PENDING', 'APPROVED', 'DENIED', 'CANCELLED'),
  approver_id UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  
  created_at TIMESTAMP
);

CREATE TABLE sil_conversions (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  year INT,
  
  unused_sil_days DECIMAL(5,2),
  daily_rate DECIMAL(10,2),
  conversion_amount DECIMAL(10,2),
  
  included_in_payroll_id UUID REFERENCES payroll(id),
  conversion_date DATE,
  
  created_at TIMESTAMP
);
```

### Backend Logic

```typescript
// apps/api/src/modules/leave/leave.service.ts

calculateLeaveBalance(employeeId, year, leaveTypeId) {
  // For SIL: 5 days after 1 year employment
  // For Vacation: per company policy
  // Calculate: opening + earned - used = available
}

createLeaveRequest(employeeId, leaveTypeId, startDate, endDate) {
  const days = calculateBusinessDays(startDate, endDate);
  const balance = await getAvailableBalance(employeeId, leaveTypeId);
  
  if (days > balance) throw Error('Insufficient balance');
  
  return createRequest(employeeId, leaveTypeId, days);
}

approveLeaveRequest(requestId, supervisorId) {
  const request = await findRequest(requestId);
  
  request.status = 'APPROVED';
  request.approver_id = supervisorId;
  request.approved_at = now();
  
  // Deduct from balance
  await deductFromBalance(request.employee_id, request.leave_type_id, request.number_of_days);
  
  // Create timesheet entry (marked as leave)
  await createLeaveTimeEntry(request);
  
  // Notify employee
  await notifyEmployee('Your leave was approved');
}

// Year-end batch job (Dec 1-15)
processYearEndSILConversion() {
  const employees = await getAllEmployees();
  
  for (const employee of employees) {
    const balance = await getLeaveBalance(employee.id, 'SIL', currentYear);
    
    if (balance.ending_balance > 0) {
      const dailyRate = calculateDailyRate(employee);
      const conversionAmount = balance.ending_balance * dailyRate;
      
      createSILConversion({
        employee_id: employee.id,
        unused_sil_days: balance.ending_balance,
        daily_rate: dailyRate,
        conversion_amount: conversionAmount,
        conversion_date: now()
      });
      
      // Flag for Dec payroll to include as "SIL Cash Conversion"
    }
  }
}
```

### API Endpoints

```
POST   /api/leave-requests              — Create request
PATCH  /api/leave-requests/:id          — Approve/deny
GET    /api/leave-requests              — List (employee/supervisor view)
GET    /api/leave-balances/:employeeId  — Get balance
GET    /api/leave-balances/:employeeId/history — Annual history
```

### Do Not Touch

- ❌ Payroll calculation (separate feature)
- ❌ User salary
- ❌ Holiday calendar (separate)
- ❌ Timesheet submission workflow

### Verification Checklist

**SIL Logic:**
- [ ] SIL earned only after 1 year employment
- [ ] SIL always 5 days/year for full-time
- [ ] Part-time prorated correctly
- [ ] Unused SIL converts to cash at year-end
- [ ] Conversion amount = unused days × daily rate

**Leave Requests:**
- [ ] Can create request
- [ ] Supervisor can approve/deny
- [ ] Approved request deducts from balance
- [ ] Balance never goes negative
- [ ] Carryover respected (if enabled)

**Year-End Conversion:**
- [ ] Batch job runs successfully
- [ ] All employees checked
- [ ] Conversion amounts calculated
- [ ] Flagged in Dec payroll

**Database:**
- [ ] Migration includes seed data (SIL, Vacation, Sick leave types)

**Testing:**
- [ ] `npm run test` passes
- [ ] Test: Full-time employee gets 5 days SIL
- [ ] Test: Part-time (8 months) gets 3.33 days
- [ ] Test: Year-end conversion computes correctly

### Success Criteria

✅ 100% SIL compliance with Labor Code
✅ Unused SIL never expires without cash payment
✅ Carryover rules enforced
✅ Zero balance errors

---

## FEAT-5: HR Attendance & Schedule

**Estimated Time:** 2-3 weeks  
**Priority:** MEDIUM (depends on FEAT-4)  
**Dependencies:** FEAT-4 (Leave Management)

### Feature Overview
Track attendance, show supervisor notes on employee schedules, auto-flag patterns.

**Quick Scope:**
- Attendance status tracking (Present/Late/Absent/Half-Day/On-Leave/Holiday)
- Supervisor notes (visible to employees)
- Pattern detection (3+ lates in 30 days)
- Employee schedule calendar view
- Holiday indicators
- Analytics dashboard

### Database Schema

```sql
CREATE TABLE attendance_logs (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  
  date DATE,
  shift_start TIME,
  shift_end TIME,
  
  clock_in_time TIMESTAMP,
  clock_out_time TIMESTAMP,
  total_hours DECIMAL(5,2),
  
  status ENUM('PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY'),
  minutes_late INT,
  
  leave_request_id UUID REFERENCES leave_requests(id),
  holiday_id UUID REFERENCES holidays(id),
  
  supervisor_note TEXT,
  supervisor_id UUID REFERENCES users(id),
  
  is_flagged BOOLEAN,
  flag_reason VARCHAR(255),
  
  created_at TIMESTAMP
);

CREATE TABLE attendance_patterns (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  
  metric_date DATE,
  
  lates_count_30d INT,
  absences_count_30d INT,
  half_days_count_30d INT,
  on_leave_days_30d INT,
  attendance_rate_pct DECIMAL(5,2),
  
  is_at_risk BOOLEAN,
  risk_level ENUM('LOW', 'MEDIUM', 'HIGH'),
  
  created_at TIMESTAMP
);
```

### Backend Logic

```typescript
// apps/api/src/modules/attendance/attendance.service.ts

createAttendanceLog(employeeId, date, clockInTime, clockOutTime) {
  // Determine status based on clock times
  const shiftStart = getShiftStart(employeeId, date);
  
  if (!clockInTime) {
    status = 'ABSENT';
  } else if (clockInTime > shiftStart + 15min) {
    status = 'LATE';
    minutesLate = clockInTime - shiftStart;
  } else {
    status = 'PRESENT';
  }
  
  // Check if it's a holiday
  if (isHoliday(date)) {
    status = 'HOLIDAY';
    holidayId = holiday.id;
  }
  
  // Check if employee took leave
  if (hasApprovedLeave(employeeId, date)) {
    status = 'ON_LEAVE';
  }
  
  return createLog({
    employee_id: employeeId,
    date: date,
    status: status,
    clock_in_time: clockInTime,
    clock_out_time: clockOutTime
  });
}

addSupervisorNote(attendanceId, note, supervisorId) {
  log.supervisor_note = note;
  log.supervisor_id = supervisorId;
  
  // Flag if pattern detected
  if (isLateAndHasPattern(log.employee_id)) {
    log.is_flagged = true;
    log.flag_reason = '3rd late in 30 days';
  }
  
  await notifyEmployee('Supervisor added a note to your attendance');
}

calculateAttendancePatterns(employeeId) {
  // Run daily (cron job)
  const logs30d = getLogsLast30Days(employeeId);
  
  const latesCount = logs30d.filter(l => l.status === 'LATE').length;
  const absencesCount = logs30d.filter(l => l.status === 'ABSENT').length;
  const workingDays = calculateWorkingDays(employeeId);
  const attendanceRate = (workingDays - absencesCount) / workingDays * 100;
  
  let riskLevel = 'LOW';
  if (latesCount >= 4 || absencesCount >= 3) riskLevel = 'HIGH';
  else if (latesCount >= 2 || absencesCount >= 2) riskLevel = 'MEDIUM';
  
  return createPattern({
    employee_id: employeeId,
    lates_count_30d: latesCount,
    absences_count_30d: absencesCount,
    attendance_rate_pct: attendanceRate,
    risk_level: riskLevel
  });
}
```

### Frontend Components

```
Location: apps/web/app/hr/
├── attendance/
│   ├── page.tsx              (Supervisor view)
│   └── components/
│       ├── AttendanceCard.tsx
│       └── AnalyticsDash.tsx
│
└── my-schedule/
    ├── page.tsx              (Employee calendar view)
    └── components/
        ├── ScheduleCalendar.tsx
        ├── LegendComponent.tsx
        └── HolidayIndicator.tsx
```

### Do Not Touch

- ❌ Clock in/out logic (separate)
- ❌ Time tracking (stays as-is)
- ❌ Leave requests (separate)
- ❌ Payroll integration

### Verification Checklist

**Attendance Status:**
- [ ] Status correctly assigned (PRESENT/LATE/ABSENT/etc.)
- [ ] Holiday indicator shows
- [ ] Leave status shows
- [ ] Minutes late calculated
- [ ] Time-off logic doesn't conflict

**Supervisor Features:**
- [ ] Can add notes
- [ ] Notes visible to employee
- [ ] Pattern detection triggers at 3+ lates
- [ ] Flags appear on dashboard

**Employee Schedule:**
- [ ] Calendar shows all dates
- [ ] Color legend visible
- [ ] Holiday indicators show
- [ ] Supervisor notes visible
- [ ] Mobile responsive

**Analytics:**
- [ ] Attendance rate calculated correctly
- [ ] Risk levels assigned
- [ ] 30-day rolling window works
- [ ] At-risk employees flagged

**Database:**
- [ ] Migration runs cleanly
- [ ] Seed data includes holidays

**Testing:**
- [ ] `npm run test` passes
- [ ] Test: Late by 15min → LATE status
- [ ] Test: On approved leave → ON_LEAVE status
- [ ] Test: 4 lates in 30 days → HIGH risk

### Success Criteria

✅ Attendance tracking 100% accurate
✅ Supervisor notes visible to employees
✅ Pattern detection catches issues early
✅ Zero false flags
✅ Calendar easy to use on mobile

---

## FEAT-6: Daily Scrum UX Redesign

**Estimated Time:** 2 weeks  
**Priority:** LOW (nice-to-have, after core features)  
**Dependencies:** All other features

### Feature Overview
Tabbed interface to reduce scrolling and cognitive load in Daily Scrum.

**Quick Scope:**
- Tab 1: PLAN YOUR DAY (Today's Commitments only)
- Tab 2: LOG YOUR WORK (Work Details + timer)
- Tab 3: END-OF-DAY REVIEW (EOD form only)
- Tab 4: SUBMIT FOR APPROVAL (Confirmation)
- Progress bar
- Mobile responsive

### Reference
See `daily-scrum-ux-improvements.md` for full design details.

### Frontend Components

```
Location: apps/web/app/scrum/
├── page.tsx              (Tabbed interface)
├── components/
│   ├── TabNavigation.tsx
│   ├── ProgressBar.tsx
│   ├── PlanTab.tsx
│   ├── WorkTab.tsx
│   ├── ReviewTab.tsx
│   └── SubmitTab.tsx
```

### Do Not Touch

- ❌ Scrum submission logic (stays as-is)
- ❌ Permission workflow
- ❌ Lock/unlock mechanism
- ❌ AI features

### Verification Checklist

**UI Flow:**
- [ ] Tab 1 loads with Today's Commitments
- [ ] Tab 2 shows only Work Details
- [ ] Tab 3 shows only EOD Review
- [ ] Tab 4 shows confirmation checklist
- [ ] Progress bar updates as tabs complete

**Mobile:**
- [ ] Responsive on 375px (iPhone)
- [ ] Responsive on 768px (tablet)
- [ ] Tab text not truncated
- [ ] Buttons 44px+ for touch

**Performance:**
- [ ] No layout shifts
- [ ] Scroll depth < 600px on each tab
- [ ] Page load < 2s

**Data Integrity:**
- [ ] Form data persists across tabs
- [ ] Back button works
- [ ] Cancel discards unsaved data

**Testing:**
- [ ] `npm run test` passes
- [ ] Test: Switch tabs → data preserved
- [ ] Test: Mobile responsiveness

### Success Criteria

✅ 70% reduction in scrolling
✅ Completion time < 10 min (vs. 15-20 min)
✅ Error rate < 5%
✅ User satisfaction > 4/5 stars

---

## Suggested Build Order

**Week 1-2: FEAT-1 (Bug Tracking)**
- Easiest to implement (isolated)
- High user value
- No dependencies
- Builds confidence

**Week 3-4: FEAT-2 (Time Clock Limits)**
- Quick win (1 week)
- Complements time tracking
- No dependencies
- Users see immediate value

**Week 5-8: FEAT-3 (Enhanced Payroll)**
- Complex but critical
- Blocks FEAT-4
- 3-4 weeks intensive
- Must be 100% accurate

**Week 8-10: FEAT-4 (Leave Management)**
- Depends on FEAT-3
- High compliance value
- Blocks FEAT-5
- Year-end automation needed

**Week 10-13: FEAT-5 (HR Attendance)**
- Depends on FEAT-4
- Builds on leave system
- Supervisor + employee views
- Analytics bonus

**Week 13-15: FEAT-6 (Daily Scrum UX)**
- Pure UX polish
- After all core features complete
- No functional changes needed

---

## Feature Build Checklist (Copy for Each Feature)

```
FEAT-[N]: [Feature Name]

BEFORE I START:
☐ Read this prompt
☐ Read the referenced design doc (if exists)
☐ Paste the Shared Rules above
☐ Identify all files to create/modify
☐ List files that are OFF-LIMITS

DURING BUILD:
☐ Database schema migrated first
☐ API endpoints implemented
☐ Frontend components built
☐ Tests written
☐ Verification checklist completed

AFTER BUILD:
☐ All tests pass
☐ No console errors
☐ Permissions enforced
☐ Rollback plan documented
☐ Summary written

VERIFICATION:
☐ Each item in verification checklist ✓
☐ Success criteria met
☐ Zero breaking changes
```

---

## Resources

- Bug Tracking: `feature-bug-tracking.md`
- Time Clock Limits: `time-clock-shift-limits.md`
- Payroll: `payroll-enhancement-roadmap.md`
- Leave Management: `payroll-enhancement-roadmap.md` (Leave section)
- HR Attendance: `hr-attendance-schedule-improvements.md`
- Daily Scrum UX: `daily-scrum-ux-improvements.md`
- UI Standards: `ui-development-prompt.md`
