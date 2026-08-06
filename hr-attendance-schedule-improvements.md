# TimeForge HR Attendance & Schedule Enhancements

**Improve attendance tracking and employee schedule visibility with supervisor notes, legends, and holiday indicators.**

---

## Current State vs. Target

| Feature | Current | Target |
|---------|---------|--------|
| **Attendance View** | Basic table with in/out times | Enhanced with status indicators, late/absent flags |
| **Employee Schedule** | Bare calendar with no context | Legend + holiday indicators + supervisor notes |
| **Supervisor Notes** | Not visible to employees | Notes appear on schedule view |
| **Holiday Indicators** | No visual marking | Color-coded holiday/special day indicators |
| **Attendance Patterns** | No insights | Dashboard showing attendance trends |
| **Tardiness/Absences** | Logged but not flagged | Auto-flagged with notes for pattern detection |

---

## 1. Enhanced Attendance Tracking (Priority: HIGH)

### Current State Problem
Attendance is logged as in/out timestamps, but:
- No visual status indicators (Present, Late, Absent, Half-Day, etc.)
- No pattern detection (repeated tardiness, absenteeism)
- Supervisor notes not linked to attendance records
- No quick view of attendance anomalies

### Target: Attendance Dashboard & List View

**Employee Attendance Card/Row:**
```
┌─────────────────────────────────────────┐
│ Date: Aug 2, 2026                       │
│ Status: 🟢 PRESENT (On Time)            │
│                                         │
│ In: 08:00 AM | Out: 05:00 PM | 9 hrs  │
│ Overtime: 1 hour                        │
│                                         │
│ Holiday: None                           │
│ Supervisor Note: (none)                 │
│                                         │
│ [View Details] [Add Note] [Mark Absent] │
└─────────────────────────────────────────┘

Status Indicators:
🟢 PRESENT (On Time)    — Clocked in before shift time
🟡 LATE                 — Clocked in 15+ min after shift
🔴 ABSENT               — Did not clock in/out
🟠 HALF-DAY             — Left early without approval
🟣 ON-LEAVE             — Approved leave (SIL/Vacation/Sick)
⭐ HOLIDAY              — Regular/Special holiday (paid)
```

### Attendance Status Logic

```
IF no time entries for day:
  → Status = ABSENT (flag for supervisor review)
  
IF clocked in after shift time + tolerance (e.g., 15 min):
  → Status = LATE
  → Calculate lateness minutes
  → Flag if part of pattern (3+ lates in 30 days)
  
IF clocked out early before shift end:
  → Status = HALF-DAY (unless approved)
  
IF has approved leave request for day:
  → Status = ON-LEAVE
  → Show leave type (SIL, Vacation, Sick, etc.)
  
IF date is holiday (from holiday calendar):
  → Status = HOLIDAY
  → Show holiday name
  → Show rate if worked (2.00x, 1.30x, etc.)
  
ELSE:
  → Status = PRESENT (on time)
```

### Database Schema

```sql
-- Attendance status tracking
CREATE TABLE attendance_logs (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  
  date DATE,
  shift_start TIME, -- e.g., 08:00
  shift_end TIME,   -- e.g., 17:00
  
  clock_in_time TIMESTAMP,
  clock_out_time TIMESTAMP,
  total_hours DECIMAL(5,2),
  
  status ENUM('PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY'),
  
  -- For LATE status
  minutes_late INT, -- e.g., 15 minutes
  late_reason TEXT, -- optional free text
  
  -- Link to leave (if ON_LEAVE)
  leave_request_id UUID REFERENCES leave_requests(id),
  
  -- Link to holiday (if HOLIDAY)
  holiday_id UUID REFERENCES holidays(id),
  
  -- Supervisor fields
  supervisor_note TEXT,
  supervisor_id UUID REFERENCES users(id),
  noted_at TIMESTAMP,
  
  is_flagged BOOLEAN DEFAULT false, -- for pattern detection
  flag_reason VARCHAR(255), -- e.g., "3rd late in 30 days"
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Attendance patterns (auto-calculated daily)
CREATE TABLE attendance_patterns (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  
  metric_date DATE, -- date of calculation
  
  lates_count_30d INT, -- lates in last 30 days
  absences_count_30d INT,
  half_days_count_30d INT,
  
  on_leave_days_30d INT,
  working_days_30d INT,
  attendance_rate_pct DECIMAL(5,2), -- % days present
  
  is_at_risk BOOLEAN, -- if lates/absences >= threshold
  risk_level ENUM('LOW', 'MEDIUM', 'HIGH'), -- for supervisor alerts
  
  created_at TIMESTAMP
);

-- Supervisor notes on attendance
CREATE TABLE attendance_notes (
  id UUID PRIMARY KEY,
  attendance_log_id UUID REFERENCES attendance_logs(id),
  supervisor_id UUID REFERENCES users(id),
  
  note TEXT NOT NULL,
  note_type ENUM('GENERAL', 'TARDINESS', 'ABSENCE', 'COMMENDATION'),
  
  is_visible_to_employee BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

### Supervisor Attendance Management

**Supervisor View:**
- List all team members' daily attendance
- Quick actions: Mark Absent, Add Note, Flag Pattern
- Filter by status (Late, Absent, etc.)
- Bulk actions (e.g., "Mark all present" for shift workers)
- Alerts for pattern detection (e.g., "John has 4 lates in 30 days")

**Marking Absences Manually:**
```
Date: Aug 3, 2026
Employee: [Select]
Reason: Sick (notify payroll to deduct SIL)
Note: "Contacted by phone, will send medical cert"
[Save]
```

---

## 2. Enhanced Employee Schedule View (Priority: HIGH)

### Current State Problem
Employee schedule is a bare calendar showing only dates/shifts. Missing:
- Holiday indicators (which day is holiday?)
- Color legend (what do colors mean?)
- Supervisor notes visible to employee
- Leave requests and approvals
- Visual distinction between regular day, holiday, leave

### Target: Rich Calendar View

**Calendar Header & Legend:**
```
┌──────────────────────────────────────────┐
│ My Schedule — August 2026                │
│                                          │
│ LEGEND:                                  │
│ 🟢 Regular Working Day                   │
│ 🔵 Approved Leave (SIL/Vacation/Sick)    │
│ 🟡 Pending Leave Request                 │
│ ⭐ Regular Holiday (Paid)                 │
│ 🟠 Special Non-Working Day                │
│ 🟣 Special Working Day                    │
│ 🔴 Personal Note from Supervisor          │
│                                          │
└──────────────────────────────────────────┘

Calendar Grid:
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Sun │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│     │  1  │  2  │  3  │  4  │  5  │  6  │
│     │ 🟢  │ 🟢  │ 🟢  │ 🟢  │ 🟢  │     │
│     │ 8AM │ 8AM │ 8AM │ 8AM │ 8AM │     │
│     │ OFF │ OFF │ OFF │ OFF │ OFF │     │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│  7  │  8  │  9  │ 10  │ 11  │ 12  │ 13  │
│     │ 🔵  │ 🔵  │ 🟢  │ 🟢  │ ⭐  │ ⭐  │
│     │ SIL │ SIL │ 8AM │ 8AM │ NYD │ NYD │
│     │     │     │     │     │ Pd  │ Pd  │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ 14  │ 15  │ 16  │ 17  │ 18  │ 19  │ 20  │
│     │ 🟢  │ 🟡  │ 🟢  │ 🟢  │ 🟢  │     │
│     │ 8AM │ VAC │ 8AM │ 8AM │ 8AM │     │
│     │     │Pend│     │     │     │     │
│     │ 💬  │     │     │     │     │     │ ← Supervisor note
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
```

**Day Detail Popover (click on any date):**
```
┌─────────────────────────────────────────┐
│ Saturday, August 2, 2026                 │
├─────────────────────────────────────────┤
│                                         │
│ Status: 🟢 REGULAR WORKING DAY           │
│                                         │
│ Shift: 08:00 AM - 05:00 PM (8 hrs)      │
│ Rest Day: No (Tuesday-Friday, Sat Rest) │
│                                         │
│ Holiday Type: None                      │
│ Holiday Rate: N/A                       │
│                                         │
│ Leave Status: None                      │
│ Supervisor Notes:                       │
│   "Great work on Q3 project! — Mgr"     │
│   (Added Aug 1 by Sarah Chen)            │
│                                         │
│ [Request Leave] [View Timesheet] [Close]│
│                                         │
└─────────────────────────────────────────┘
```

---

### Schedule View Features

**1. Holiday Indicators**
- Pull from `holidays` table
- Show holiday name, type (Regular/Special), rate if worked
- Color-coded by holiday type

**2. Leave Status**
- Show approved SIL/Vacation/Sick with dates
- Show pending leave requests with "Pend" label
- Show denied leaves (optional)

**3. Supervisor Notes**
- Any note added to attendance record appears on calendar
- Note icon (💬) indicates note exists
- Click to expand/read full note
- Employees can see all notes marked "visible_to_employee"

**4. Shift Information**
- Show shift start/end time
- Show if it's a rest day (no work scheduled)
- Show expected working hours

**5. Color Coding**
```
🟢 Green:   Regular working day, present
🔵 Blue:    Approved leave (SIL/Vacation/Sick)
🟡 Yellow:  Pending leave request
⭐ Gold:    Regular holiday (paid day off)
🟠 Orange:  Special non-working day (no pay if absent)
🟣 Purple:  Special working day (regular pay)
🔴 Red:     Personal note from supervisor (flagged)
```

---

### Database Schema

```sql
-- Schedule/shift assignments (if rotating)
CREATE TABLE shift_assignments (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  
  date DATE,
  shift_start TIME,
  shift_end TIME,
  expected_hours DECIMAL(5,2),
  
  is_rest_day BOOLEAN,
  rest_reason VARCHAR(100), -- e.g., "Regular Saturday"
  
  created_at TIMESTAMP
);

-- Link attendance notes to schedule view
-- (uses attendance_logs + attendance_notes)
```

---

## 3. Supervisor Notes System (Priority: HIGH)

### Features

**Supervisor can add notes to:**
- Individual attendance dates
- Leave requests
- Performance observations
- Disciplinary actions
- Commendations

**Notes include:**
- Date/time added
- Visibility flag (visible to employee or admin-only)
- Note type (general, tardiness, absence, etc.)
- Auto-notification to employee (if visible)

**Employee View:**
- Sees all "visible" notes on their schedule
- Can click to expand and read full text
- Notes appear chronologically
- Can reply/acknowledge (optional)

**Supervisor View:**
- Dashboard of all notes added to team
- Filter by employee, date, note type
- Bulk export for performance reviews
- Link notes to disciplinary actions (if applicable)

---

## 4. Attendance Analytics Dashboard (Priority: MEDIUM)

**For Supervisors & HR:**

```
┌────────────────────────────────────────────┐
│ Team Attendance Overview (August 2026)     │
├────────────────────────────────────────────┤
│                                            │
│ 📊 Attendance Rate: 96.2%                  │
│    12 working days × 8 people = 96 days   │
│    92 days present + attended              │
│                                            │
│ 🔴 At-Risk Employees:                      │
│    • John Dela Cruz: 4 lates (30d)         │
│    • Maria Santos: 3 absences (30d)        │
│    • James Lee: 6 lates + 2 absent         │
│                                            │
│ 📈 Trends (Last 30 Days):                  │
│    Lates: 8 → 6 → 5 (improving)            │
│    Absences: 2 → 3 → 4 (worsening)         │
│                                            │
│ 🎯 Action Items:                           │
│    [ ] Follow up with James Lee            │
│    [ ] Commend John's improvement          │
│    [ ] Review Maria's sick leave trend     │
│                                            │
│ [View Detailed Report] [Export CSV]        │
│                                            │
└────────────────────────────────────────────┘
```

**Metrics to Track:**
- Overall attendance rate (%)
- Late arrivals (count & avg minutes)
- Absences (count & pattern)
- Approved leave usage (days taken vs. available)
- Overtime hours
- Employees at-risk (flagged)
- Trends over time (week/month/quarter)

---

## 5. Holiday Calendar Management (Priority: MEDIUM)

**Admin View:**
```
┌──────────────────────────────────────────┐
│ Philippine Holiday Calendar — 2026        │
├──────────────────────────────────────────┤
│                                          │
│ Date        │ Holiday          │ Type    │
│ ────────────┼──────────────────┼─────────│
│ Jan 1       │ New Year         │ Regular │
│ Feb 10      │ SONA             │ Special │
│ Feb 25      │ EDSA Anniversary │ Working │
│ Apr 9       │ Araw ng Kagitingan│Regular│
│ Apr 10      │ Good Friday      │ Regular │
│ Apr 11      │ Black Saturday   │ Special │
│ ...         │ ...              │ ...     │
│                                          │
│ [+ Add Holiday] [Import BIR Calendar]    │
│                                          │
└──────────────────────────────────────────┘
```

**Fields:**
- Holiday date
- Holiday name
- Holiday type (Regular/Special/Working)
- Is working day (checkbox)
- Pay rate multiplier (for payroll lookup)

---

## Implementation Roadmap

### Phase 1 (Sprint 1-2): Foundation
- [ ] Enhanced attendance logging (status indicators)
- [ ] Attendance dashboard for supervisors
- [ ] Supervisor notes system
- [ ] Basic employee schedule view

### Phase 2 (Sprint 3-4): Holiday & Leave Integration
- [ ] Holiday calendar management
- [ ] Leave request display on schedule
- [ ] Holiday pay rate lookup for payroll
- [ ] Schedule legend & color coding

### Phase 3 (Sprint 5-6): Analytics & Insights
- [ ] Attendance pattern detection
- [ ] At-risk employee alerts
- [ ] Team attendance analytics dashboard
- [ ] Trend reports (weekly/monthly)

### Phase 4 (Sprint 7+): Enhancements
- [ ] Mobile-friendly schedule view
- [ ] Geolocation check-in (GPS verification)
- [ ] Biometric integration (if applicable)
- [ ] Automated absence notifications
- [ ] Performance review integration

---

## Testing Scenarios

### Test Case 1: Attendance Status Logic
```
Employee: John
Date: Aug 2, 2026 (Friday)
Shift: 08:00 - 17:00
Clock In: 08:15 AM (15 min late)
Clock Out: 17:30 PM (30 min OT)

Expected Result:
Status: LATE
Minutes Late: 15
Total Hours: 9.25 (includes 0.5 OT)
Supervisor Note: Can add note
Pattern: Check if 3+ lates in 30 days
```

### Test Case 2: Holiday with Supervisor Note
```
Date: Aug 21, 2026 (Ninoy Aquino Day - Regular Holiday)
Holiday Type: REGULAR
Pay Rate: 1.00x (paid leave, no work)

Employee Views Schedule:
- Shows ⭐ REGULAR HOLIDAY
- Shows "Paid" indicator
- Shows supervisor note if any

Employee Doesn't Work:
- Status: HOLIDAY
- Payroll: Full day's pay (no clock in/out needed)

Employee Works Anyway:
- Status: HOLIDAY (WORKED)
- Payroll: 2.00x (double pay)
```

### Test Case 3: Supervisor Note Visibility
```
Supervisor: Sarah adds note on Aug 1
"Great work on client presentation!"
Visibility: Employee

Employee Views Schedule on Aug 2:
- Sees 💬 note icon
- Clicks to expand
- Reads full message from Sarah
- Can optionally reply/acknowledge

HR Admin Views:
- Sees all notes (visible + hidden)
- Can filter by supervisor, employee, date
```

---

## Success Metrics

✅ Supervisors can review team attendance in < 2 minutes
✅ Employees understand their schedule and holiday status immediately
✅ Attendance patterns flagged within 24 hours of 3rd occurrence
✅ Zero missed payroll holiday rate adjustments
✅ Employee satisfaction with transparency: > 90%
✅ Reduction in attendance-related disputes: 50%+

Sources:
- [Holiday Pay Rules and Computation Guide for Philippine Employers (2026)](https://sprout.ph/articles/holiday-pay-rules-philippines/)
- [Philippine Holiday Pay Rules: Regular vs Special Non-Working Days (2026)](https://kamiworkforce.com/ph/blog/philippine-holiday-pay-rules/)
- [Guide to Holiday pay and wages in the Philippines | 2026 Update](https://www.forvismazars.com/ph/en/insights/hr-payroll-alerts/guide-to-holiday-wages-in-the-philippines/)
