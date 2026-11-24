import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <rect width="24" height="24" rx="2" className="fill-primary" />
      <path
        d="M6.5 8.5H13.5V11.5H9.5V15.5H6.5V8.5Z"
        className="fill-primary-foreground"
      />
      <path
        d="M17.5 15.5H10.5V12.5H14.5V8.5H17.5V15.5Z"
        className="fill-primary-foreground/75"
      />
    </svg>
  );
}
