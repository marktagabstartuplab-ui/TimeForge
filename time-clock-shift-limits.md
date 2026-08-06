# TimeForge Time Clock — 12-Hour Shift Limit

**Enforce maximum shift duration of 12 hours to prevent overwork and ensure compliance.**

---

## Overview

**Problem:** Time clock currently allows unlimited clocking duration. Employees can forget to clock out, creating:
- Inaccurate timesheet records
- Payroll calculation errors
- Labor law violations (excessive hours)
- System data integrity issues

**Solution:** Implement automatic 12-hour shift limit with warnings and auto-clock-out.

---

## Time Clock Shift Duration Rules

### 1. Maximum Shift Duration = 12 Hours

**Logic:**
```
Clock In Time: 08:00 AM
Max Clock Out Time: 08:00 PM (12 hours later)

If employee hasn't clocked out by 8:00 PM:
  → System shows WARNING alert
  → Prompt: "Your shift is now 12 hours. Clock out?"
  → Options: [Clock Out Now] [Continue (Override)] [Extend]
```

### 2. Standard Shift Limits (by Shift Type)

| Shift Type | Duration | Rules |
|-----------|----------|-------|
| Regular (Morning) | 8-10 hrs | Clock out by shift end + 2 hrs grace |
| Regular (Evening) | 8-10 hrs | Clock out by shift end + 2 hrs grace |
| Extended (12-hr) | 12 hrs | Hard limit at 12 hours |
| Overtime | 8 + 2-4 hrs | Supervisor approval required for >12 hrs total |

### 3. Time Clock UI & Warnings

**Normal Shift (8 hours):**
```
Clock In: 08:00 AM
Current Time: 05:00 PM (9 hours elapsed)
Status: ✅ WORKING (within limits)

Shift Status Bar:
[████████░░░░] 75% of max 12 hrs used

Estimated Clock Out: 08:00 PM (3 hours remaining)
```

**Approaching Limit (11+ hours):**
```
Clock In: 08:00 AM
Current Time: 07:45 PM (11 hours 45 min elapsed)
Status: ⚠️ WARNING - APPROACHING 12-HOUR LIMIT

Shift Status Bar:
[████████████] 99% of max 12 hrs used

⚠️ ALERT: You have 15 minutes before automatic clock-out
[Clock Out Now] [Continue (Supervisor Override)] [Request Extension]
```

**At 12-Hour Mark:**
```
Clock In: 08:00 AM
Current Time: 08:00 PM (12 hours elapsed)
Status: 🔴 12-HOUR LIMIT REACHED

⛔ SHIFT OVER - System has auto-clocked you out
Clock Out Time: 08:00 PM (12:00 hrs)

If you continued working past this time:
  → System requires supervisor approval
  → Overtime hours tracked separately
  → Requires manual adjustment by HR/Supervisor

[View Details] [Contact Supervisor]
```

---

## Auto-Clock-Out Behavior

### At Exactly 12 Hours:

**If Employee is Still Clocked In:**
```
Action: System auto-clocks out employee
Clock Out Time: Exactly 12 hours from clock in
Status: AUTO-CLOCKED OUT (system-initiated)

Timesheet Entry:
  Clock In: 08:00 AM
  Clock Out: 08:00 PM (auto)
  Total: 12:00 hours
  Note: "Auto-clocked at 12-hour limit"

Notification to Employee:
  "You were automatically clocked out at 12 hours.
   If you continued working, contact your supervisor
   to manually log the additional time."

Notification to Supervisor:
  "John was auto-clocked at 12 hours on Aug 2, 2026.
   If he worked beyond this, approve the extra hours."
```

### Manual Override (Supervisor Only)

If employee needs to work beyond 12 hours:

```
Employee clicks: [Continue (Supervisor Override)]

Popup appears:
  "This shift is now at the 12-hour maximum.
   Continuing will require supervisor approval.
   
   Contact your supervisor or they can approve
   the extension manually.
   
   [Request Supervisor Approval] [Cancel]"

Supervisor receives alert:
  "John requests extension beyond 12 hours.
   Current time: 08:15 PM
   Approve additional [  ] hours of work?
   
   [Approve] [Deny]"

If Approved:
  Employee can continue clocking
  Additional time tracked as "Approved Overtime"
  Marked for manual payroll review

If Denied:
  System auto-clocks out immediately
  Employee cannot continue clocking
```

---

## Database Schema

```sql
-- Shift configuration per employee or company
CREATE TABLE shift_configurations (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  
  shift_name VARCHAR(50), -- 'Standard 8hr', 'Extended 12hr', etc.
  max_shift_duration DECIMAL(5,2), -- 8.0, 10.0, 12.0
  grace_period_minutes INT, -- e.g., 30 min after shift end
  requires_supervisor_override BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP
);

-- Assign shift config to employee
CREATE TABLE employee_shift_assignments (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  shift_config_id UUID REFERENCES shift_configurations(id),
  
  effective_date DATE,
  end_date DATE, -- null if current
  
  created_at TIMESTAMP
);

-- Track time clock sessions
CREATE TABLE time_clock_sessions (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  
  clock_in_time TIMESTAMP NOT NULL,
  clock_out_time TIMESTAMP,
  
  total_hours DECIMAL(5,2), -- calculated
  
  shift_config_id UUID REFERENCES shift_configurations(id),
  max_allowed_hours DECIMAL(5,2), -- 12.0 at time of clock-in
  
  -- Auto-clock-out tracking
  is_auto_clocked_out BOOLEAN DEFAULT false,
  auto_clock_out_reason VARCHAR(100), -- e.g., '12-hour limit reached'
  
  -- Supervisor override tracking
  requires_override BOOLEAN DEFAULT false,
  supervisor_override_id UUID REFERENCES users(id),
  override_approved BOOLEAN,
  override_reason TEXT,
  override_approved_at TIMESTAMP,
  
  -- Overtime tracking
  is_overtime BOOLEAN DEFAULT false,
  overtime_hours DECIMAL(5,2),
  overtime_approved BOOLEAN,
  
  status ENUM('ACTIVE', 'CLOCKED_OUT', 'AUTO_CLOCKED_OUT', 'OVERRIDE_PENDING'),
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Audit log for shift limit violations
CREATE TABLE shift_limit_violations (
  id UUID PRIMARY KEY,
  time_clock_session_id UUID REFERENCES time_clock_sessions(id),
  employee_id UUID REFERENCES users(id),
  
  violation_type ENUM('APPROACHED_LIMIT', 'REACHED_LIMIT', 'AUTO_CLOCKED_OUT', 'MANUAL_OVERRIDE'),
  violation_time TIMESTAMP,
  
  hours_worked_at_violation DECIMAL(5,2),
  additional_time_requested DECIMAL(5,2), -- if override
  
  notified_supervisor_id UUID REFERENCES users(id),
  supervisor_action ENUM('APPROVED', 'DENIED', 'NO_ACTION'),
  supervisor_action_time TIMESTAMP,
  
  created_at TIMESTAMP
);
```

---

## Time Clock UI Implementation

### Clock In Screen
```
┌─────────────────────────────────────┐
│ TIME CLOCK                          │
├─────────────────────────────────────┤
│                                     │
│ Current Time: 08:00 AM              │
│                                     │
│ [ Clock In ]                        │
│                                     │
│ Your Shift Info:                    │
│ Shift Type: Standard 8-Hour         │
│ Max Duration: 12 hours              │
│ Shift Start: 08:00 AM               │
│ Shift End: 05:00 PM (est.)          │
│                                     │
│ ℹ️ You can work up to 12 hours      │
│ before auto-clock-out.              │
│                                     │
└─────────────────────────────────────┘

After Clock In:
┌─────────────────────────────────────┐
│ ✅ CLOCKED IN                       │
├─────────────────────────────────────┤
│ Clock In: 08:00 AM                  │
│ Time Elapsed: 00:05                 │
│                                     │
│ Shift Status:                       │
│ [████░░░░░░░░░░░░░░] 4% of 12 hrs  │
│                                     │
│ [ Clock Out ]                       │
│                                     │
│ Hours Remaining: 11h 55m             │
│                                     │
└─────────────────────────────────────┘
```

### Approaching Limit (11+ hours)
```
┌─────────────────────────────────────┐
│ ⚠️ SHIFT LIMIT WARNING              │
├─────────────────────────────────────┤
│                                     │
│ Clock In: 08:00 AM                  │
│ Current Time: 07:45 PM (11h 45m)   │
│                                     │
│ Shift Status:                       │
│ [████████████████░] 98% of 12 hrs  │
│                                     │
│ ⏰ 15 MINUTES until automatic       │
│    clock-out at 08:00 PM            │
│                                     │
│ [ Clock Out Now ]                   │
│ [ Continue (Supervisor Override) ]  │
│                                     │
│ Hours Remaining: 15 minutes         │
│                                     │
└─────────────────────────────────────┘
```

### At 12-Hour Limit
```
┌─────────────────────────────────────┐
│ 🔴 12-HOUR LIMIT REACHED            │
├─────────────────────────────────────┤
│                                     │
│ Clock In: 08:00 AM                  │
│ Auto Clock Out: 08:00 PM            │
│ Total Hours: 12:00                  │
│                                     │
│ Shift Status:                       │
│ [████████████████████] 100% (FULL) │
│                                     │
│ Your shift has ended. You have      │
│ been automatically clocked out      │
│ after 12 hours.                     │
│                                     │
│ If you worked past this time:       │
│ Contact your supervisor to          │
│ approve the additional hours.       │
│                                     │
│ [ Contact Supervisor ]              │
│ [ View Timesheet ]                  │
│                                     │
└─────────────────────────────────────┘
```

---

## Supervisor Override Workflow

**Scenario:** Employee worked past 12 hours with supervisor approval

```
1. EMPLOYEE SIDE:
   At 12-hour mark, clicks [Continue (Supervisor Override)]
   
   System shows:
   "Continuing past 12 hours requires supervisor approval.
    Notify your supervisor?"
   
   [Request Approval] [Cancel]

2. SUPERVISOR RECEIVES NOTIFICATION:
   "John Dela Cruz has requested to work beyond 12 hours.
    Date: Aug 2, 2026
    Current Time: 08:15 PM (15 min overtime)
    
    How many additional hours to approve?
    [ 1 ] hour(s)
    
    [Approve] [Deny]"

3. IF APPROVED:
   - Employee can continue clocking
   - Additional time tracked in "overtime" field
   - Notification sent back: "Your supervisor approved
     1 additional hour. Clock out by 09:00 PM."

4. FINAL TIMESHEET:
   Clock In: 08:00 AM
   Clock Out: 09:00 PM
   Regular Hours: 12:00
   Overtime Hours: 1:00 (supervisor-approved)
   Total: 13:00
   
   Payroll treats:
   - 12 hrs @ regular rate
   - 1 hr @ overtime rate (1.25x)
```

---

## Configuration Options

**Admin can configure per company:**

```
Global Settings:
├─ Default Max Shift: 12 hours
├─ Grace Period: 30 minutes (after shift end)
├─ Warning Alert At: 11+ hours
├─ Auto-Clock-Out At: Exactly 12 hours
└─ Supervisor Override Required: Yes

Shift Types:
├─ Standard 8-hr: max 8 hrs (can extend to 12)
├─ Extended 10-hr: max 10 hrs (can extend to 12)
└─ Full 12-hr: max 12 hrs (hard limit)

Overtime Handling:
├─ Overtime Starts After: 8 hrs (standard)
├─ Overtime Rate: 1.25x
├─ Max Overtime Approved: 4 hrs/day (user configurable)
└─ Requires Supervisor Approval: Yes
```

---

## Testing Scenarios

### Test Case 1: Normal 8-Hour Shift
```
Clock In: 08:00 AM
Expected Clock Out: 05:00 PM (8 hrs)

Progress:
- 08:00 to 05:00: ✅ Proceed normally
- Status bar updates: 0% → 50% → 100% (of 12 hrs max)
- At 05:00 PM: No warning (only 8 hrs used)
- Employee clocks out manually at 05:05 PM
- Timesheet: 8 hrs 5 min (normal)
```

### Test Case 2: Approaching 12-Hour Limit
```
Clock In: 08:00 AM
Current Time: 07:50 PM (11 hrs 50 min)

Expected Behavior:
- ⚠️ WARNING appears: "10 minutes until auto-clock-out"
- Status bar shows: 99% full
- Buttons available: [Clock Out Now] [Continue (Override)]

Employee clicks [Clock Out Now]:
- Clocked out immediately at 07:50 PM
- Timesheet: 11 hrs 50 min (normal)

OR Employee clicks [Continue (Override)]:
- Supervisor receives approval request
```

### Test Case 3: Reaches 12-Hour Limit
```
Clock In: 08:00 AM
Current Time: 08:00 PM (exactly 12 hrs)

Expected Behavior:
- 🔴 AUTO-CLOCK-OUT triggered
- System clocks out immediately
- Clock Out Time: 08:00 PM (exactly 12 hrs)
- Status: AUTO-CLOCKED_OUT
- Notification to employee + supervisor

Supervisor Review:
- Dashboard shows: "John auto-clocked at 12 hrs today"
- If additional work was done: Supervisor manually approves
```

### Test Case 4: Supervisor-Approved Overtime
```
Clock In: 08:00 AM
Current Time: 07:55 PM (11 hrs 55 min)

Employee clicks [Continue (Supervisor Override)]

Supervisor Approves:
- "Approve 1 additional hour? [✓] Approve"

Result:
- Employee can work until 09:00 PM
- At 09:00 PM: Auto-clock-out again
- Timesheet: 13 hrs (12 regular + 1 OT)
- Payroll: 12 hrs @ 1.00x + 1 hr @ 1.25x
```

---

## Success Metrics

✅ Zero instances of > 12-hour shifts without approval
✅ Auto-clock-out prevents data entry errors
✅ Supervisor overrides tracked 100% in audit log
✅ Employee satisfaction: understands max duration
✅ Payroll accuracy: overtime hours correctly identified
✅ Labor compliance: no excessive hour violations

---

## Implementation Priority

**Phase 1 (Sprint 1):**
- [x] 12-hour limit enforcement
- [x] Auto-clock-out at 12 hours
- [x] Warning alerts at 11+ hours

**Phase 2 (Sprint 2):**
- [ ] Supervisor override workflow
- [ ] Overtime tracking & approval
- [ ] Audit log for violations

**Phase 3 (Sprint 3+):**
- [ ] Configurable shift limits per shift type
- [ ] Reports on overtime usage
- [ ] Integration with payroll overtime calculation
