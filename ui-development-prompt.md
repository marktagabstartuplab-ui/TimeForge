# TimeForge UI/UX Development Prompt

**Mandatory guidelines for all UI implementations to ensure system integrity, consistency, and usability.**

**Use this prompt BEFORE implementing any new feature or UI component.**

---

## Pre-Development Checklist

Before writing any UI code, answer these questions:

### 1. System Integrity & Safety
- [ ] Does this change affect existing data structures or database schema?
- [ ] Will this break any existing API endpoints or services?
- [ ] Does this introduce new dependencies that might conflict?
- [ ] Is there a rollback plan if something breaks?
- [ ] Have I checked for potential security vulnerabilities?
- [ ] Are there any permission/RBAC conflicts?

### 2. Design System Consistency
- [ ] Does this component exist in the existing design system?
- [ ] If not, does it follow established patterns (colors, typography, spacing)?
- [ ] Are font sizes, weights, and colors consistent with existing pages?
- [ ] Does it use the same button styles, inputs, and form elements?
- [ ] Are animations and transitions consistent with system defaults?
- [ ] Does the layout match the grid/spacing system (8px, 16px, 24px, etc.)?

### 3. Accessibility & Usability
- [ ] Is the component keyboard navigable?
- [ ] Do all interactive elements have proper focus states?
- [ ] Are colors used accessibly (not relying on color alone to convey meaning)?
- [ ] Is the contrast ratio WCAG AA compliant (4.5:1 for text)?
- [ ] Are all form inputs labeled properly?
- [ ] Does the layout work on mobile (responsive)?

### 4. Navigation & Discoverability
- [ ] Is the feature visible in the sidebar navigation for applicable roles?
- [ ] Can users easily find this feature without hunting?
- [ ] Are breadcrumbs or navigation trails clear?
- [ ] Is the feature linked from related pages?
- [ ] Is the feature documented in help or tooltips if needed?

### 5. Performance
- [ ] Will this load large datasets? (pagination/virtualization needed?)
- [ ] Are images optimized (lazy loading)?
- [ ] Is the component re-rendering unnecessarily?
- [ ] Will this slow down page load time significantly?

---

## UI Component Structure & Card-Based Design

### When to Use Cards

**Use card components for:**
- Lists of items (employees, projects, sprints, bugs, etc.)
- Summary information that groups related data
- Status dashboards with multiple metrics
- Leave requests, attendance records, timesheet entries
- Holiday/event listings

**Don't use cards for:**
- Single inline actions or statuses
- Form inputs (unless grouping multiple fields)
- Navigation elements
- Error messages

### Card Template (Recommended Structure)

```
┌─────────────────────────────────────────────────┐
│                                                 │
│ [Icon] Title/Heading          [Status Badge]  │
│ Subtitle or context info                       │
│                                                 │
│ ─────────────────────────────────────────────── │ ← Optional divider
│                                                 │
│ Primary Information:                            │
│ • Key data point 1                             │
│ • Key data point 2                             │
│                                                 │
│ ─────────────────────────────────────────────── │ ← Optional divider
│                                                 │
│ [Action Button] [Secondary Action]             │
│                                                 │
└─────────────────────────────────────────────────┘

Spacing Rules:
- Padding inside card: 16px (top/bottom), 20px (left/right)
- Gap between cards: 16px
- Border radius: 8px
- Shadow: Light (subtle elevation)
- Hover state: Subtle shadow increase, cursor pointer
```

### Example Cards from Your System

**Leave Request Card:**
```
┌──────────────────────────────────────┐
│ 📋 Leave Request               [PENDING] │
│ Service Incentive Leave              │
│ ──────────────────────────────────── │
│ Dates: Aug 5 - Aug 7, 2026           │
│ Duration: 3 days                     │
│ Balance: 2 days remaining            │
│ ──────────────────────────────────── │
│ [Approve] [Deny] [View Details]     │
└──────────────────────────────────────┘
```

**Attendance Card:**
```
┌──────────────────────────────────────┐
│ 🟢 Aug 2, 2026             PRESENT   │
│ John Dela Cruz                       │
│ ──────────────────────────────────── │
│ In: 08:00 AM | Out: 05:00 PM        │
│ Total: 9 hours                       │
│ Supervisor Note: "Great work today"  │
│ ──────────────────────────────────── │
│ [Edit] [Add Note] [View Details]    │
└──────────────────────────────────────┘
```

**Holiday Card:**
```
┌──────────────────────────────────────┐
│ ⭐ New Year's Day          REGULAR   │
│ January 1, 2026                      │
│ ──────────────────────────────────── │
│ Holiday Type: Regular Holiday        │
│ Pay Rate: 1.00x (Paid Leave)         │
│ If Worked: 2.00x (Double Pay)        │
│ ──────────────────────────────────── │
│ [View Details] [Mark Working]       │
└──────────────────────────────────────┘
```

---

## Navigation Patterns & Easy Discovery

### Sidebar Navigation Best Practices

**Hierarchy:**
```
WORK
├─ Dashboard
├─ Time & Timesheets
├─ Daily Scrum
└─ My Outputs

APPROVALS
├─ Leave Requests
├─ Timesheets to Approve
└─ Scrum Submissions

HR
├─ Attendance
├─ My Schedule
├─ Performance
└─ Leave Management

REPORTS
├─ Payroll
├─ Performance Reports
├─ Administrative Reports
└─ Attendance

ADMIN (if applicable)
├─ Settings
├─ Users
└─ AI Configuration

SUPPORT
├─ Report a Bug
└─ View Submitted Issues
```

**Rules:**
- Max 2 levels of nesting
- Use icons for visual scanning
- Active state clearly highlighted
- Section titles (WORK, HR, etc.) in caps
- 16px padding/spacing

### Breadcrumb Navigation

```
Dashboard > Leave Management > Leave Requests > Details

Use when:
- Page is 3+ levels deep
- User needs context of where they are
- Quick navigation back to parent pages
```

### Link Placement for Feature Discovery

**Example: Bug Tracking System**
```
1. Sidebar: + Report a Bug (top-level)
2. Top Navigation: Support menu
3. Dashboard: "Unresolved Bugs" widget with link
4. Context: Inline links from related features
5. Help: Footer link to bug submission
```

---

## Design System Rules (Copy & Paste)

### Colors (Philippines Theme)
```
Primary Blue:    #0066CC (CTA buttons, links, active states)
Success Green:   #10B981 (Approved, Present, Online)
Warning Yellow:  #F59E0B (Pending, Late, Warning)
Error Red:       #EF4444 (Denied, Absent, Error)
Gray (Text):     #374151 (Regular text, labels)
Gray (BG):       #F3F4F6 (Card backgrounds, sections)
White:           #FFFFFF (Backgrounds, cards)

Currency Color:  #10B981 (For monetary values, ₱)
Time Color:      #0066CC (For times, durations)
```

### Typography
```
Heading 1 (Page Title):      28px, Bold, Gray #1F2937
Heading 2 (Section Title):   20px, Semibold, Gray #1F2937
Heading 3 (Card Title):      16px, Semibold, Gray #1F2937
Body Text:                   14px, Regular, Gray #374151
Label/Caption:               12px, Regular, Gray #6B7280
Button Text:                 14px, Semibold, White on color
```

### Spacing System (8px base)
```
xs:  4px   (internal spacing)
sm:  8px   (tight spacing)
md:  16px  (standard spacing)
lg:  24px  (section spacing)
xl:  32px  (major sections)
```

### Border Radius
```
Buttons & Inputs:  6px
Cards:             8px
Modals:            12px
```

### Shadows
```
Subtle:    0 1px 2px rgba(0,0,0,0.05)
Medium:    0 4px 6px rgba(0,0,0,0.1)
Large:     0 10px 15px rgba(0,0,0,0.1)

Use on: Cards, Modals, Dropdowns
```

---

## Component Reuse Checklist

Before creating a new component, check if it already exists:

```
☐ Button               → Use from design system
☐ Input Field          → Use from design system
☐ Dropdown/Select      → Use from design system
☐ Modal/Dialog         → Use from design system
☐ Alert/Toast          → Use from design system
☐ Table/Data Grid      → Use from design system
☐ Date Picker          → Use from design system
☐ Badge/Status Tag     → Use from design system
☐ Card                 → Use from design system (or create new)
☐ Form Layout          → Use from design system
☐ Empty State          → Check if pattern exists
☐ Loading Skeleton     → Use consistent pattern
```

**If component doesn't exist:**
1. Create in design system first (reusable)
2. Document usage guidelines
3. Test across all roles
4. Add to component library

---

## Responsive Design Rules

### Breakpoints
```
Mobile:     0px - 640px     (vertical stack, full-width cards)
Tablet:     641px - 1024px  (2-column layout)
Desktop:    1025px+         (multi-column, sidebars)
```

### Mobile-First Approach
```
1. Design for mobile first (single column)
2. Add layout improvements at tablet (2 cols)
3. Add advanced features at desktop (3+ cols, sidebars)
```

### Card Layout Responsive Rules
```
Mobile:     1 column, 16px margin
Tablet:     2 columns, 16px gap
Desktop:    3-4 columns, 16px gap (max-width 1200px per row)
```

---

## Testing Before Launch

### Functional Testing
- [ ] All buttons/links work
- [ ] Forms submit correctly
- [ ] Data displays accurately
- [ ] Sorting/filtering works
- [ ] Pagination works (if applicable)
- [ ] No console errors

### Browser/Device Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Chrome
- [ ] Mobile Safari

### Accessibility Testing
- [ ] Tab through all interactive elements
- [ ] Screen reader test (NVDA or VoiceOver)
- [ ] Color contrast check (WAVE tool)
- [ ] Keyboard-only navigation

### Performance Testing
- [ ] Page loads in < 2 seconds (on 3G)
- [ ] No layout shifts (Cumulative Layout Shift < 0.1)
- [ ] Lighthouse score > 90

### User Testing
- [ ] Ask 3 users to complete a task without guidance
- [ ] Time to complete: < 1 minute for common actions
- [ ] User satisfaction: > 4/5 stars
- [ ] Collect feedback on confusion points

---

## Common Pitfalls (Don't Do This)

❌ **Mixing Design Styles:**
- Don't use different button styles on same page
- Don't mix colors inconsistently
- Don't vary spacing without reason

❌ **Breaking Existing Features:**
- Don't change existing API contracts
- Don't remove permissions/access checks
- Don't modify database without migration

❌ **Poor Navigation:**
- Don't hide features in deep menus
- Don't remove breadcrumbs when needed
- Don't create "dead ends" (pages with no way back)

❌ **Accessibility Issues:**
- Don't rely on color alone (also use icons/text)
- Don't create tiny touch targets (< 44px on mobile)
- Don't auto-play audio/video
- Don't trap keyboard focus

❌ **Performance Issues:**
- Don't load all data at once (use pagination)
- Don't forget lazy loading for images
- Don't create memory leaks in event listeners
- Don't make blocking API calls on render

---

## Implementation Prompt (Paste This When Starting)

```
BEFORE I START CODING, I CONFIRM:

1. System Integrity:
   ☐ I've identified all files I will modify
   ☐ I've checked for breaking changes
   ☐ I have a rollback plan
   ☐ I've reviewed permission/RBAC requirements

2. Design Consistency:
   ☐ I'm using existing design system components
   ☐ Colors, fonts, spacing match existing pages
   ☐ Layout follows established grid system
   ☐ Interactive states (hover, focus, active) are defined

3. Usability:
   ☐ Feature is discoverable from sidebar/navigation
   ☐ Card-based layout (if applicable) follows template
   ☐ Responsive design breakpoints implemented
   ☐ Keyboard navigation works
   ☐ Mobile experience tested

4. Testing:
   ☐ Functional tests written
   ☐ Accessibility (WCAG AA) verified
   ☐ Performance acceptable (< 2s load)
   ☐ No console errors or warnings

5. Documentation:
   ☐ Feature behavior documented
   ☐ User-facing help text included
   ☐ Dev team notified of changes
   ☐ Rollback procedure documented
```

---

## Success Criteria

✅ **System Integrity:**
- No breaking changes to existing features
- All RBAC/permissions respected
- No data loss or corruption
- Rollback available if needed

✅ **Design Consistency:**
- Colors, fonts, spacing match system
- 100% component reuse from design system
- No visual inconsistencies across pages
- Animations consistent

✅ **Usability:**
- New feature discoverable in < 30 seconds
- Common tasks completed in < 1 minute
- 0 accessibility violations (WCAG AA)
- Works on mobile, tablet, desktop

✅ **Performance:**
- Page loads in < 2 seconds
- No layout shifts (CLS < 0.1)
- Lighthouse score > 90
- No memory leaks

✅ **User Feedback:**
- User satisfaction > 4/5 stars
- Zero confused users in testing
- Positive feedback on card/layout design
- Navigation praise or no complaints
