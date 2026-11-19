import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <Empty className={cn("gap-3 border-0 p-4 md:p-6", className)}>
      <EmptyHeader>
        {icon && <EmptyMedia className="mb-0">{icon}</EmptyMedia>}
        <h3 className="text-lg font-medium tracking-tight">{title}</h3>
        {description && <EmptyDescription>{description}</EmptyDescription>}
        {action && <EmptyContent>{action}</EmptyContent>}
      </EmptyHeader>
    </Empty>
  );
}
