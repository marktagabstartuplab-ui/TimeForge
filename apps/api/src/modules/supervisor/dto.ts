export interface SupervisorPendingTimesheetsQuery {
  limit?: string;
  cursor?: string;
  status?: string;
}

export interface SupervisorDailyScrumsQuery {
  limit?: string;
}

export interface SupervisorTeamKpisQuery {
  kpiTemplateId?: string;
}

export interface SupervisorProductivityQuery {
  from?: string;
  to?: string;
}
