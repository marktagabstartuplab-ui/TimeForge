export interface SupervisorAiQuery {
  teamId?: string;
  departmentId?: string;
  employeeId?: string;
  from?: string;
  to?: string;
  period?: 'daily' | 'weekly' | 'monthly';
}

export interface SupervisorAiExportDto {
  format: 'CSV' | 'XLSX' | 'PDF';
  teamId?: string;
  departmentId?: string;
  from?: string;
  to?: string;
}
