import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  value: string;
  className?: string;
}

export function StatusBadge({ value, className }: StatusBadgeProps) {
  const key = value.toLowerCase();
  
  const colors = {
    // Success / Active
    success: "text-success bg-success/10",
    active: "text-success bg-success/10",
    healthy: "text-success bg-success/10",
    in_scope: "text-success bg-success/10",
    "yes": "text-success bg-success/10",
    
    // Info / Pending / Review
    info: "text-info bg-info/10",
    running: "text-info bg-info/10",
    reviewing: "text-info bg-info/10",
    promising: "text-info bg-info/10",
    monitoring: "text-info bg-info/10",
    interesting: "text-info bg-info/10",
    manual: "text-info bg-info/10",
    candidate: "text-info bg-info/10",
    
    // Warning / Degraded / Queued
    warning: "text-warning bg-warning/10",
    queued: "text-warning bg-warning/10",
    degraded: "text-warning bg-warning/10",
    limited: "text-warning bg-warning/10",
    unknown: "text-warning bg-warning/10",
    paused: "text-warning bg-warning/10",
    
    // Destructive / Failed / Offline
    destructive: "text-destructive bg-destructive/10",
    failed: "text-destructive bg-destructive/10",
    offline: "text-destructive bg-destructive/10",
    out_of_scope: "text-destructive bg-destructive/10",
    high: "text-destructive bg-destructive/10",
    critical: "text-destructive bg-destructive/10",
    cancelled: "text-destructive bg-destructive/10",
    archived: "text-muted-foreground bg-muted",
  };

  const colorClass = Object.entries(colors).find(([k]) => key.includes(k))?.[1] || "text-muted-foreground bg-muted";

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "border-current/20 font-mono text-[10px] uppercase tracking-wider",
        colorClass,
        className
      )}
    >
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
