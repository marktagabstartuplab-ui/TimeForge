"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { getPermissionMatrix } from "../api/employee-management.service";

export function PermissionMatrixCard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["employee-management", "permission-matrix"],
    queryFn: getPermissionMatrix,
  });

  return (
    <SectionCard title="Role Permissions Overview" className="flex-1">
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : isError || !data ? (
        <ErrorState message="Couldn't load the permission matrix." onRetry={() => refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#c3c6d2]/50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <th className="pb-2 pr-4">Permission</th>
                {data.roles.map((r) => (
                  <th key={r.id} className="pb-2 pr-4 text-center">{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/30">
              {data.resources.map((resource) => (
                <Fragment key={resource.resource}>
                  <tr className="bg-[#f6f3f4]/60">
                    <td colSpan={data.roles.length + 1} className="py-1.5 pr-4 text-xs font-bold uppercase tracking-wide text-brand-navy">
                      {resource.label}
                    </td>
                  </tr>
                  {resource.permissions.map((perm) => (
                    <tr key={perm.key}>
                      <td className="py-2 pr-4 text-brand-muted">{perm.label}</td>
                      {data.roles.map((r) => (
                        <td key={r.id} className="py-2 pr-4 text-center">
                          {perm.roles[r.id] ? (
                            <Check className="mx-auto h-4 w-4 text-[#16a34a]" aria-hidden="true" />
                          ) : (
                            <span className="text-brand-muted/30">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
