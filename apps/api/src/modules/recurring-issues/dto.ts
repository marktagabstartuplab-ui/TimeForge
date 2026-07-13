export interface RecurringIssueQuery {
  departmentId?: string;
  projectId?: string;
  from?: string;
  to?: string;
  status?: 'OPEN' | 'RESOLVED';
}
