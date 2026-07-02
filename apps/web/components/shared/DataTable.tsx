import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  /** Extra classes for both header and body cells (e.g. text-right, w-24). */
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered inside the table body area when rows is empty. */
  emptyState?: React.ReactNode;
  "aria-label"?: string;
}

/**
 * Light table matching the Figma audit/history tables: muted uppercase header
 * band, hairline row separators. Scrolls horizontally on small screens.
 */
export function DataTable<T>({ columns, rows, rowKey, emptyState, ...aria }: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left" aria-label={aria["aria-label"]}>
        <thead>
          <tr className="bg-[#f6f3f4]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-4 py-3 text-xs font-bold uppercase tracking-[0.6px] text-brand-muted first:rounded-l-[8px] last:rounded-r-[8px]",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-[#c3c6d2]/40 last:border-b-0">
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-4 align-middle text-sm text-brand-ink", col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
