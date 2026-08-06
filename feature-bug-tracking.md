# TimeForge Bug Tracking Module — Feature Specification

A dedicated bug tracking system integrated into TimeForge, allowing all roles to report, assign, and track issues with role-based permissions and visibility.

---

## Overview

**Purpose:** Enable users to report bugs, track their status, and manage fixes without leaving TimeForge. Replaces manual bug reporting with a structured workflow.

**Access:** All roles (Employee, Supervisor, Admin, HR, Finance)

**Key Features:**
- Bug reporting form with structured fields
- Real-time status tracking (Open, In Progress, Fixed, Closed)
- Role-based visibility and permissions
- Assignment to developers/admins
- Priority levels and severity classification
- Attachment support (screenshots, error logs)
- Comments and activity log

---

## Role-Based Permissions

| Action | Employee | Supervisor | Admin | HR | Finance |
|--------|----------|-----------|-------|-----|---------|
| **Report Bug** | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Own Reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| View All Bugs | ❌ | ✅ | ✅ | ✅ | ✅ |
| Assign Bug | ❌ | ✅ | ✅ | ✅ | ❌ |
| Change Status | ❌ | ❌ | ✅ | ✅ | ❌ |
| Reassign | ❌ | ❌ | ✅ | ❌ | ❌ |
| Close Bug | ❌ | ❌ | ✅ | ✅ | ❌ |
| Delete Bug | ❌ | ❌ | ✅ | ❌ | ❌ |
| Set Priority | ❌ | ❌ | ✅ | ❌ | ❌ |

---

## Bug Report Form Fields

**Issue (Required):**
- Brief description of the bug (max 200 chars)

**Who is affected (Required):**
- Affected role/department (e.g., "admin dashboard", "all users", "team leads")

**What I see (Required):**
- Detailed description of actual behavior
- Step-by-step reproduction

**Expected (Required):**
- Description of what should happen instead

**Error message (Optional):**
- Full error message from console/logs
- Stack trace if available

**Where it happens (Required):**
- Page/module name (e.g., "Admin Dashboard > Scrum Dashboard")
- URL or navigation path

**Attachments (Optional):**
- Screenshots, videos, error logs
- File size limit: 10MB per file

---

## Status Workflow

```
OPEN → IN PROGRESS → FIXED → CLOSED
  ↓         ↓          ↓
  └─────────┴──────────┘
    (can revert to any stage)
```

**Status Definitions:**
- **OPEN:** Newly reported, not yet assigned or acknowledged
- **IN PROGRESS:** Assigned to developer, actively being worked on
- **FIXED:** Developer marked as fixed, awaiting verification
- **CLOSED:** Verified fixed or marked as won't-fix/duplicate
- **BLOCKED:** Waiting on external dependency

---

## Priority & Severity

**Priority (User-facing impact):**
- **Critical:** Blocks core workflow, data loss, security issue
- **High:** Major feature broken, significant workaround needed
- **Medium:** Minor feature broken, workaround available
- **Low:** Cosmetic, minor UX friction, no functional impact

**Severity (Risk level):**
- **P0:** Fix immediately, hot-patch if needed
- **P1:** Fix in current sprint
- **P2:** Fix in next sprint
- **P3:** Fix when bandwidth available
- **P4:** Nice-to-have, low priority

---

## Page Layout

### Bug List (Dashboard)

```
┌─────────────────────────────────────────┐
│ BugTrack                                │
│ Report bugs and view submitted issues   │
├─────────────────────────────────────────┤
│                                         │
│ Fix Queue                   [Show All]  │
│ 0 bugs (active only)                    │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ No Active Bugs                      │ │
│ │ All bugs are resolved or closed     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [+ Report a Bug]                        │
└─────────────────────────────────────────┘
```

### Bug Detail View

```
┌──────────────────────────────────────────────┐
│ Bug Title                        [Priority]  │
│ Status: OPEN | Assigned to: [User]          │
├──────────────────────────────────────────────┤
│                                              │
│ Issue:                                       │
│ Brief description                            │
│                                              │
│ Who is affected:                             │
│ admin dashboard, all users                   │
│                                              │
│ What I see:                                  │
│ [Detailed description + steps]               │
│                                              │
│ Expected:                                    │
│ [Expected behavior]                          │
│                                              │
│ Error message:                               │
│ [Error text, if applicable]                  │
│                                              │
│ Where it happens:                            │
│ Admin Dashboard > Scrum Dashboard            │
│                                              │
│ Attachments: [screenshot.png] [error.log]   │
│                                              │
│ ───────────────────────────────────────────  │
│ Activity & Comments                          │
│ ───────────────────────────────────────────  │
│ Admin assigned this to @developer 2 hours ago
│                                              │
│ @developer: Looking into this now            │
│ @admin: Thanks, let me know if you need help │
│                                              │
│ [Add comment...]                             │
│                                              │
│ [Change Status] [Reassign] [Close] [Delete]  │
└──────────────────────────────────────────────┘
```

---

## Database Schema

```sql
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
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  resolved_at TIMESTAMP,
  
  organization_id UUID REFERENCES organizations(id) -- Tenant isolation
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
  action VARCHAR(100), -- 'created', 'status_changed', 'assigned', etc.
  old_value VARCHAR(255),
  new_value VARCHAR(255),
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMP
);
```

---

## API Endpoints

```
POST   /api/bugs                    -- Create bug report
GET    /api/bugs                    -- List bugs (filtered by role)
GET    /api/bugs/:id                -- Get bug detail
PATCH  /api/bugs/:id                -- Update bug status/priority/assignment
DELETE /api/bugs/:id                -- Delete bug (admin only)

POST   /api/bugs/:id/comments       -- Add comment
POST   /api/bugs/:id/attachments    -- Upload file
GET    /api/bugs/:id/activity       -- Get activity log

GET    /api/bugs/stats              -- Dashboard stats (open, in progress, closed)
```

---

## Sidebar Navigation

Add to all role sidebars (Employee, Supervisor, Admin, HR, Finance):

```
└─ SUPPORT
   ├─ Report a Bug
   └─ View Submitted Issues (admin only)
```

---

## Navigation Flow

1. **Report a Bug** button → Opens bug report form modal
2. **View Submitted Issues** → Lists all bugs (role-filtered)
3. Click bug card → Bug detail view with comments and history
4. Admins can change status, assign, close from detail view
5. Email notifications on assignment or status change

---

## Implementation Priority

1. **Sprint 1 (MVP):** Bug reporting form, list view, detail view, basic status workflow
2. **Sprint 2:** Assignment workflow, admin controls, email notifications
3. **Sprint 3:** Activity log, advanced filtering, search, metrics/dashboard
4. **Sprint 4:** Integrations (Slack notifications, GitHub issue sync, etc.)

---

## Success Metrics

- All bugs reported through the system within 1 week
- Average bug report quality (completeness of required fields): > 90%
- Admin response time to open bugs: < 4 hours
- Bug resolution time: tracked in dashboard
- User satisfaction: bug tracking reduces back-and-forth communication by 50%
