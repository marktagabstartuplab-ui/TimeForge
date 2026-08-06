# TimeForge Payroll Enhancement Roadmap

**Real-World Philippine Compliance & Deductions**

Based on 2026 BIR requirements, SSS/PhilHealth/Pag-IBIG contributions, and 13th-month pay regulations.

---

## Current State vs. Target

| Feature | Current | Target |
|---------|---------|--------|
| **Income Tax Withholding** | Hardcoded/manual | Dynamic BIR tax table lookup |
| **SSS Contribution** | Not calculated | 5% employee, 10% employer (auto) |
| **PhilHealth** | Not calculated | 2.5% employee, 2.5% employer (auto) |
| **Pag-IBIG** | Not calculated | 1-2% employee, 1-2% employer (auto) |
| **13th Month Pay** | Manual entry | Auto-calculated at year-end |
| **Part-Time Support** | None | Prorated calculations per employment type |
| **Overtime Pay** | Hardcoded 25% | Configurable by admin (currently in Phase 2) |
| **Deduction Slip** | Not generated | Auto-generated PDF per pay run |
| **Contribution Remittance** | Manual tracking | Auto-calculated and flagged for remittance |
| **Tax Compliance Report** | None | BIR-ready monthly/annual reports |

---

## Payroll Deduction System (Priority: CRITICAL)

### 1. Automatic Withholding Calculation

**Income Tax (BIR Withholding)**

The 2026 BIR tax table applies progressive withholding:
- First ₱250,000 of annual taxable income: Tax-free
- ₱250,001 to ₱400,000: 15% on excess
- ₱400,001 to ₱800,000: ₱22,500 + 20% on excess
- ₱800,001 to ₱2,000,000: ₱102,500 + 25% on excess
- ₱2,000,001 and above: ₱402,500 + 30% on excess

**Taxable Income Formula:**
```
Taxable Income = Gross Compensation
                 - Employee SSS Contribution
                 - Employee PhilHealth Contribution
                 - Employee Pag-IBIG Contribution
                 - Non-Taxable Benefits (if applicable)
```

**Implementation:**
- Backend: Create `BirTaxCalculator` service with 2026 tax brackets
- Store monthly/annual YTD tracking to compute accurate withholding
- Recalculate monthly as gross salary accumulates
- Generate tax computation summary on payslip

---

### 2. Social Security System (SSS) Contribution

**Contribution Rate (2026):**
- Employee Rate: 5%
- Employer Rate: 10%
- Salary Ceiling: ₱29,500/month (SSS coverage max)

**Calculation:**
```
Employee SSS = Min(Gross Salary, 29500) × 5%
Employer SSS = Min(Gross Salary, 29500) × 10%
```

**Implementation:**
- Auto-deduct from employee net pay
- Flag employer contribution as due to SSS
- Validate against SSS salary ceiling
- Generate SSS remittance report monthly

---

### 3. PhilHealth Contribution

**Contribution Rate (2026):**
- Employee Rate: 2.5%
- Employer Rate: 2.5%
- Minimum Monthly: ₱500
- Maximum Monthly: ₱5,000

**Calculation:**
```
Employee PhilHealth = Max(500, Min(5000, Gross × 2.5%))
Employer PhilHealth = Max(500, Min(5000, Gross × 2.5%))
```

**Implementation:**
- Auto-deduct from employee net pay
- Apply minimum/maximum caps correctly
- Flag employer contribution as due to PhilHealth
- Generate PhilHealth remittance report monthly

---

### 4. Pag-IBIG Contribution

**Contribution Rate (2026):**
- Employee Rate: 1-2% (based on salary)
- Employer Rate: 1-2% (matches employee)
- Employee Cap: ₱200/month (for salaries > ₱10,000)
- No employer cap

**Calculation:**
```
If Salary ≤ 1,500: 1% flat
If 1,500 < Salary ≤ 10,000: 2% of salary
If Salary > 10,000:
  - Employee: capped at ₱200
  - Employer: 2% of full salary (no cap)
```

**Implementation:**
- Complex rate lookup based on salary band
- Employee capping logic for high earners
- No employer cap (unlimited employer contribution)
- Flag for monthly remittance to Pag-IBIG

---

## Employment Types & Prorating (Priority: HIGH)

### 1. Full-Time Employee

- Works standard hours (40 hours/week)
- Eligible for all benefits
- Calculations: none (standard)

### 2. Part-Time Employee

**Definition:** Works < 40 hours/week or < 12 months/year

**13th Month Pay Calculation (Prorated):**
```
Monthly Basic Salary = Annual Salary / 12
Prorated Basic = Monthly Basic × (Months Worked / 12)
13th Month Pay = Prorated Basic
```

**Example:**
- Part-time employee working 8 months in 2026
- Annual equivalent salary: ₱120,000
- Monthly basic: ₱10,000
- 13th month: ₱10,000 × (8/12) = ₱6,667

**SSS/PhilHealth/Pag-IBIG:**
- Pro-rated based on months worked
- If employed < 1 month in year: not eligible
- If employed 1-6 months: proportional contribution
- If employed 7-12 months: full contribution

**Implementation:**
- Add `employment_type` enum field to employee
- Add `employment_start_date` and `employment_end_date` for part-time tracking
- Implement prorating logic in 13th month calculation
- Adjust contribution rates based on months employed

---

## 13th Month Pay (Priority: HIGH)

**Regulation:** Mandatory for all rank-and-file employees who worked ≥ 1 month

**Eligibility:**
- Full-time employees: entitled to 1/12 of annual basic salary
- Part-time employees: entitled to prorated 1/12 (see above)
- Contractual/Casual: eligibility depends on contract terms (may exclude)

**Tax Treatment:**
- Non-taxable up to ₱90,000
- Amount above ₱90,000 subject to income tax
- Combined with other bonuses to determine taxability

**Calculation Flow:**
```
Step 1: Sum all gross monthly salaries for the year
Step 2: Divide by 12 to get 13th month base
Step 3: If part-time, apply prorating factor
Step 4: Apply tax-exempt cap (₱90,000)
Step 5: Withhold tax on excess above ₱90,000
Step 6: Release by December 24
```

**Implementation:**
- Backend: Batch job runs Nov 1 to calculate all 13th month payables
- Query all employees eligible (employment_type, months_worked ≥ 1)
- Sum gross monthly salaries YTD
- Apply prorating for part-time
- Calculate tax withheld
- Generate 13th month pay slip separate from regular payroll
- Mark as "13th Month Pay" payment type

---

## Paid Leave Management (Priority: CRITICAL)

### Service Incentive Leave (SIL) — Mandatory Benefit

**Regulation:** 5 days per year after 1 year of service (Philippine Labor Code, Article 95)

**Entitlement:**
- Full-time employees: 5 days/year (vested after 1 year)
- Part-time employees: 5 days × (months worked / 12)
- First year (0-11 months): Not eligible
- Year 2+: Eligible for 5 days

**Eligibility Tracking:**
```
Employee Start Date: Jan 1, 2024
Jan 1, 2025 (1 year mark): Becomes eligible for 5 days SIL
Annual renewal: Jan 1, 2026 (another 5 days SIL)
```

**Unused SIL Conversion (Critical):**
- Unused SIL credits are a **vested right** — must be paid if not used
- Conversion happens annually (typically Dec 31 or company-defined date)
- Calculation: Unused Days × Daily Rate (basic salary only, no allowances)
- Must be paid in cash with year-end payroll or as per company policy
- Upon resignation/termination: All unused SIL must be converted to cash

**Example:**
```
Employee accumulated 5 SIL days in 2026
Used: 2 days
Unused: 3 days
Daily rate: ₱500
Cash conversion: 3 × ₱500 = ₱1,500 (paid out in Dec payroll)
```

**Implementation Requirements:**
- Tracking: SIL balance per employee (opening balance, earned, used, ending balance)
- Leave request system: Employees submit SIL usage
- Approval workflow: Manager approves/denies SIL requests
- Year-end batch job: Calculate unused SIL → convert to cash
- Payroll integration: Add SIL cash conversion as separate line item on Dec payslip
- Termination: On employee exit, include all unused SIL conversion in final paycheck

---

### Company-Provided Vacation & Sick Leave (Optional Benefits)

**Beyond the mandatory 5-day SIL, most companies provide additional leave:**

**Typical Structure:**
- Vacation Leave: 10-15 days/year (company policy)
- Sick Leave: 5-10 days/year (company policy)
- Special Leave: Maternity, Paternity, Bereavement, etc. (as per company)

**Treatment:**
- Unlike SIL, unused vacation/sick leave typically **does not convert to cash**
- Unused days may expire at year-end or roll over (per company policy)
- Some companies allow limited carryover (e.g., max 5 days to next year)

**Implementation:**
- Store company leave policy in database
- Track separate leave balances for Vacation, Sick, Special
- Allow flexible carryover rules per leave type
- Clearly communicate to employees what happens to unused leave

---

### Leave Request & Approval Workflow

**Flow:**

```
Employee submits leave request
    ↓
Manager reviews + approves/denies
    ↓
Approved leave deducted from balance
    ↓
Payroll system marks those dates as "leave"
    ↓
During payroll: Compute pay for leave days
    ↓
Payslip shows "Leave Pay" separate from regular earnings
```

**Fields to Track:**
- Leave type (SIL, Vacation, Sick, Special)
- Date range
- Number of days
- Status (Pending, Approved, Denied, Cancelled)
- Approver
- Reason (if applicable)

---

### Leave Pay During Payroll

**How leave days affect salary:**

**Scenario:** Employee takes 3 days of SIL
- Gross salary: ₱20,000 (20 working days)
- Daily rate: ₱1,000/day
- 3 SIL days paid: ₱3,000
- Actual working days: 17
- Earnings from work: ₱17,000
- **Total gross: ₱20,000** (salary unchanged, just payment source differs)

**Payslip Breakdown:**
```
EARNINGS
Basic Salary (17 days)     ₱ 17,000.00
Service Leave Pay (3 days) ₱  3,000.00
                           ───────────
GROSS EARNINGS             ₱ 20,000.00
```

**Deductions:**
- SSS, PhilHealth, Pag-IBIG, Income Tax calculated on **full gross** (₱20,000)
- Leave pay is treated as earned compensation for tax purposes

---

### Database Schema for Leave

```sql
-- Leave types (company-defined)
CREATE TABLE leave_types (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  
  name VARCHAR(50), -- 'SIL', 'Vacation', 'Sick', 'Maternity', etc.
  description TEXT,
  is_mandatory BOOLEAN, -- true for SIL, false for optional leave
  default_days_per_year INT, -- 5 for SIL, 15 for Vacation, etc.
  
  can_convert_to_cash BOOLEAN, -- true for SIL, false for most others
  carries_over BOOLEAN, -- false for SIL/most leaves
  carryover_limit INT, -- null if no carryover, else max days
  
  created_at TIMESTAMP
);

-- Employee leave balance (tracked annually)
CREATE TABLE leave_balances (
  id UUID PRIMARY KEY,
  employee_id UUID REFERENCES users(id),
  leave_type_id UUID REFERENCES leave_types(id),
  
  year INT, -- 2026, 2027, etc.
  opening_balance DECIMAL(5,2), -- from prior year carryover
  days_earned DECIMAL(5,2), -- 5 for SIL, 15 for Vacation, etc.
  days_used DECIMAL(5,2), -- sum of approved leave requests
  days_available DECIMAL(5,2), -- opening + earned - used
  ending_balance DECIMAL(5,2), -- unused days at year-end
  
  cash_conversion_amount DECIMAL(10,2), -- if converted to cash
  cash_conversion_date DATE, -- when converted
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Leave requests (audit trail)
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
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Integration with payroll (mark days as "leave")
CREATE TABLE timesheet_leave_entries (
  id UUID PRIMARY KEY,
  timesheet_id UUID REFERENCES timesheet(id),
  leave_request_id UUID REFERENCES leave_requests(id),
  
  date DATE,
  is_leave BOOLEAN,
  leave_type_id UUID REFERENCES leave_types(id),
  leave_pay_amount DECIMAL(10,2), -- daily_rate for this leave day
  
  created_at TIMESTAMP
);

-- Year-end SIL conversion (batch job result)
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

---

### Year-End Leave Processing (Batch Job)

**Scheduled: December 1-15 (before final payroll run)**

```
FOR EACH employee:
  1. Query leave_balances for all leave types in current year
  2. For SIL:
     a. Calculate days_used from approved leave_requests
     b. ending_balance = 5 days - days_used
     c. If ending_balance > 0: Schedule for cash conversion
     d. cash_conversion_amount = ending_balance × daily_rate
  3. For Vacation/Sick:
     a. Determine carryover policy
     b. If carries_over: Roll forward up to carryover_limit
     c. If expires: Set ending_balance = 0
  4. Create sil_conversion record
  5. Flag in payroll for Dec payment run
```

**Output:**
- SIL conversion amounts to include in Dec payslip
- Notification to employees of their unused leave payout
- Year-end compliance report (all SIL conversions tracked)

---

### Leave Payslip Example (December with SIL Conversion)

```
┌──────────────────────────────────────────┐
│ PAYSLIP — December 2026 (Final)          │
├──────────────────────────────────────────┤
│ Employee: [Name]                         │
│ Employee ID: [ID]                        │
│                                          │
│ EARNINGS                                 │
│ Basic Salary (18 days)     ₱ 18,000.00   │
│ Service Leave Pay (2 days) ₱  2,000.00   │
│ SIL Cash Conversion (3d)   ₱  3,000.00   │ ← Year-end payout
│ ─────────────────────────────────────    │
│ GROSS EARNINGS             ₱ 23,000.00   │
│                                          │
│ DEDUCTIONS                               │
│ SSS (5%)                   ₱  1,150.00   │
│ PhilHealth (2.5%)          ₱    575.00   │
│ Pag-IBIG (2%)              ₱    460.00   │
│ Income Tax Withholding     ₱  2,600.00   │
│ ─────────────────────────────────────    │
│ TOTAL DEDUCTIONS           ₱  4,785.00   │
│                                          │
│ NET PAY                    ₱ 18,215.00   │
│                                          │
│ LEAVE BALANCE SUMMARY (Year-End)         │
│ Service Leave:                           │
│   Earned:           5 days               │
│   Used:             2 days               │
│   Converted to Cash: 3 days (₱3,000)    │
│   Ending Balance:   0 days               │
│                                          │
│ Vacation Leave:                          │
│   Earned:           12 days              │
│   Used:             8 days               │
│   Carried Over:     4 days (max 5)       │
│   Ending Balance:   4 days (to 2027)     │
│                                          │
└──────────────────────────────────────────┘
```

---

## Overtime & Holiday Rates (Priority: HIGH)

**Current State:** Hardcoded 25% premium (in Phase 2 BUG-AQ for admin config)

**Target Enhancements:**

### Regular Overtime (Over 40 hours/week)
- Rate: 1.25x × hourly rate (25% premium)
- Configurable by admin

### Night Shift Differential (10 PM - 6 AM)
- Rate: 1.10x × hourly rate (10% premium)
- Applied on top of base rate
- Can combine with overtime

### Holiday Rates (2026 Philippine Law)

**Regular Holiday (e.g., New Year, Independence Day, Christmas):**
- Not worked: 1.00x (paid leave, employee gets full day's pay)
- If worked (first 8 hrs): 2.00x (double pay — 200% of daily rate)
- If worked on rest day: 2.60x (260% of daily rate)

**Special Non-Working Day (e.g., All Saints' Day):**
- Not worked: 0.00x (no work, no pay — employee doesn't get paid)
- If worked (first 8 hrs): 1.30x (130% of daily rate)
- If worked on rest day: 1.50x (150% of daily rate)

**Special Working Day (e.g., Feb 25, 2026 EDSA):**
- Regular working day — 1.00x (no premium, just regular pay)
- No additional compensation

**Year-End/Company Break:** Per company policy (may be paid or unpaid)

**Calculation:**
```
Overtime Rate = (Daily Rate / 8) × Hours Over 40 × 1.25
Night Differential = (Daily Rate / 8) × Night Hours × 1.10
Holiday Pay = (Daily Rate) × (1.00 or 1.50 or 2.00 based on type)
```

**Implementation:**
- Add `overtime_rate_multiplier` to organization settings (currently admin-configurable)
- Add `night_shift_premium` rate configurable
- Add holiday calendar with holiday type classifications
- Query time entries for hours and check against holiday calendar
- Auto-calculate applicable premiums
- Display on payslip with breakdown (regular, overtime, holiday, night diff)

---

## Payslip Generation (Priority: MEDIUM)

**Required Fields on Payslip:**

```
┌──────────────────────────────────────────┐
│ PAYSLIP — [Month Year]                   │
├──────────────────────────────────────────┤
│ Employee: [Name]                         │
│ Employee ID: [ID]                        │
│ Department: [Dept]                       │
│ Position: [Title]                        │
│                                          │
│ EARNINGS                                 │
│ Basic Salary              ₱ 10,000.00    │
│ Overtime (8 hrs @ 1.25x)  ₱  1,250.00    │
│ Night Differential        ₱    400.00    │
│ Holiday Pay               ₱    500.00    │
│ ─────────────────────────────────────    │
│ GROSS EARNINGS            ₱ 12,150.00    │
│                                          │
│ DEDUCTIONS                               │
│ SSS (5%)                  ₱    500.00    │
│ PhilHealth (2.5%)         ₱    250.00    │
│ Pag-IBIG (2%)             ₱    200.00    │
│ Income Tax Withholding    ₱    650.00    │
│ ─────────────────────────────────────    │
│ TOTAL DEDUCTIONS          ₱  1,600.00    │
│                                          │
│ NET PAY                   ₱ 10,550.00    │
│                                          │
│ TAX COMPUTATION                          │
│ Gross Compensation        ₱ 12,150.00    │
│ Less: SSS                 ₱    500.00    │
│ Less: PhilHealth          ₱    250.00    │
│ Less: Pag-IBIG            ₱    200.00    │
│ Taxable Income            ₱ 11,200.00    │
│ YTD Taxable Income        ₱ 89,200.00    │
│ Tax Rate (2026)           15%             │
│ Tax on excess             ₱    650.00    │
│                                          │
└──────────────────────────────────────────┘
```

**Implementation:**
- Backend: PayslipGenerator service
- Loop through all deductions/earnings
- Calculate tax based on BIR table
- Generate PDF using template engine
- Email to employee automatically
- Store PDF in attachment storage for archive

---

## Compliance Reports (Priority: MEDIUM)

### Monthly SSS Remittance Report
- List all employees with SSS contributions
- Employer vs. employee breakdown
- Due date: 1st to 5th of following month

### Monthly PhilHealth Remittance Report
- List all employees with PhilHealth contributions
- Employer vs. employee breakdown
- Due date: 1st to 15th of following month

### Monthly Pag-IBIG Remittance Report
- List all employees with Pag-IBIG contributions
- Employer vs. employee breakdown
- Due date: 1st to 10th of following month

### Annual BIR Tax Return (Form 1601-F or 1601-CF)
- Summary of all gross compensation paid
- Withholding taxes remitted
- Summary by employee (for matching against individual 1701 forms)

### Annual 13th Month Pay Report
- List all 13th month disbursements
- Tax withheld on amount above ₱90,000
- Reconciliation with December payroll

**Implementation:**
- Backend: Reports module with scheduled generation
- Frontend: Admin can view/download reports
- Export to CSV/PDF for submission
- Email alerts when due dates approach

---

## Database Schema Extensions

```sql
-- Employment type & tracking
ALTER TABLE users ADD COLUMN (
  employment_type ENUM('FULL_TIME', 'PART_TIME', 'CONTRACTUAL'),
  employment_start_date DATE,
  employment_end_date DATE,
  is_rank_and_file BOOLEAN DEFAULT true
);

-- Payroll configuration
CREATE TABLE payroll_settings (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  
  -- Contribution rates
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
  
  -- Multipliers
  overtime_rate_multiplier DECIMAL(3,2) DEFAULT 1.25,
  night_shift_premium DECIMAL(3,2) DEFAULT 1.10,
  
  bir_tax_table_year INT DEFAULT 2026,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Payroll deductions (archive)
CREATE TABLE payroll_deductions (
  id UUID PRIMARY KEY,
  payroll_id UUID REFERENCES payroll(id),
  
  -- Gross components
  basic_salary DECIMAL(12,2),
  overtime_pay DECIMAL(12,2),
  night_differential DECIMAL(12,2),
  holiday_pay DECIMAL(12,2),
  other_allowances DECIMAL(12,2),
  
  gross_total DECIMAL(12,2),
  
  -- Deductions
  sss_contribution DECIMAL(10,2),
  philhealth_contribution DECIMAL(10,2),
  pagibig_contribution DECIMAL(10,2),
  income_tax_withheld DECIMAL(10,2),
  other_deductions DECIMAL(10,2),
  
  total_deductions DECIMAL(12,2),
  net_pay DECIMAL(12,2),
  
  -- Tax calculation for audit
  ytd_taxable_income DECIMAL(12,2),
  tax_computation_note TEXT,
  
  -- 13th month flag
  is_thirteenth_month BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP
);

-- Holiday calendar
CREATE TABLE holidays (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  
  holiday_date DATE,
  holiday_name VARCHAR(100),
  holiday_type ENUM('REGULAR', 'SPECIAL', 'DOUBLE'),
  is_working_day BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP
);
```

---

## Implementation Roadmap

### Phase 1 (Sprint 1-2): Foundation
- [x] Payroll contribution rates (SSS, PhilHealth, Pag-IBIG)
- [x] BIR tax table lookup (2026)
- [x] Payslip generation with all deductions
- [ ] Employment type classification (full-time vs. part-time)
- [ ] Basic prorating logic for part-time

### Phase 2 (Sprint 3-4): 13th Month & Compliance
- [ ] 13th month pay calculation and disbursement
- [ ] Tax treatment of 13th month (non-taxable threshold)
- [ ] Compliance report generation (SSS, PhilHealth, Pag-IBIG)
- [ ] BIR annual tax return generation

### Phase 3 (Sprint 5-6): Advanced Features
- [ ] Holiday calendar management
- [ ] Holiday pay calculations (regular, special, double)
- [ ] Night shift differential support
- [ ] Overtime multiplier configuration (currently hardcoded)

### Phase 4 (Sprint 7+): Optimization & Integration
- [ ] Payroll audit reports
- [ ] Year-end reconciliation tools
- [ ] Integration with SSS/PhilHealth/Pag-IBIG APIs (if available)
- [ ] Payslip email delivery automation
- [ ] Payroll analytics dashboard

---

## Testing Scenarios

### Test Case 1: Full-Time Employee Regular Month
- Basic salary: ₱15,000
- No overtime/holidays
- Expected net: ₱15,000 - SSS(₱750) - PhilHealth(₱375) - Pag-IBIG(₱300) - Tax(₱1,200) = ₱12,375

### Test Case 2: Part-Time Employee (8 months worked in 2026)
- Annual salary: ₱96,000 (₱8,000/month)
- Employment type: PART_TIME
- Months worked: 8
- 13th month eligibility: Yes (> 1 month)
- 13th month pay: ₱8,000 × (8/12) = ₱5,333
- Tax on 13th month: ₱0 (below ₱90,000 threshold)

### Test Case 3: Employee with Overtime
- Basic: ₱20,000
- Overtime (16 hours @ 1.25x): ₱(20,000/22) × 16 × 1.25 = ₱1,818
- Gross: ₱21,818
- Deductions: SSS ₱1,091, PhilHealth ₱546, Pag-IBIG ₱400, Tax ₱2,100
- Net: ₱17,681

### Test Case 4: Prorated SSS/PhilHealth for Employee Hired Mid-Year
- Hired: June 1
- Months employed: 7 (June-December)
- Normal monthly deduction: ₱750 SSS
- But only 7 months × ₱750 = ₱5,250 for the year

---

## Success Metrics

✅ 100% accurate deduction calculations vs. BIR 2026 tax table
✅ All 13th month payables calculated by November 30
✅ Zero compliance audit findings
✅ Employee satisfaction with payslip accuracy: > 95%
✅ Reduced payroll processing time by 50% (automation)
✅ Compliant with BIR, SSS, PhilHealth, Pag-IBIG regulations

---

## References

- [BIR Tax Table and Contribution (SSS, Philhealth, & Pag-ibig) for 2026](https://www.taxumo.com/blog/bir-tax-table-2026/)
- [Payroll Taxes in the Philippines: SSS, PhilHealth and Pag-IBIG Explained (2026)](https://peorient.com/blog/payroll-taxes-in-the-philippines-sss-philhealth-pagibig/)
- [Christmas Bonus & 13th Month Pay in the Philippines: 2026 Guide](https://iscale-solutions.com/13th-month-pay-in-the-philippines/)
- [Payroll Process In Philippines [A Complete Guide For 2026]](https://www.yomly.com/payroll-process-in-philippines/)
- [Philippines Payroll Tax & Compliance Guide (2026)](https://remotepeople.com/countries/philippines/employer-of-record/payroll-tax/)
