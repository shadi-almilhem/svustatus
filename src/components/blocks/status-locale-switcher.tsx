"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type StatusLocaleOption = {
  /** Locale code, e.g. "en", "fr". Rendered uppercase as the trigger label. */
  value: string;
  /** Human-readable label shown in the dropdown row. Caller decides language. */
  label: string;
  /** Flag image used for compact locale switching. */
  flagSrc?: string;
};

/**
 * StatusLocaleSwitcher — agnostic locale picker.
 *
 * Pure presentation: caller owns `value`, `onValueChange`, and label resolution.
 * No `next-intl`, no router, no locale detection. Renders nothing when
 * `locales.length <= 1` so callers can mount it unconditionally.
 */
export function StatusLocaleSwitcher({
  value,
  onValueChange,
  locales,
  disabled,
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof DropdownMenuTrigger>,
  "value" | "onValueChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  locales: StatusLocaleOption[];
  disabled?: boolean;
}) {
  if (locales.length <= 1) return null;
  const activeLocale = locales.find((locale) => locale.value === value) ?? locales[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(className)} asChild {...props}>
        <Button
          data-slot="status-locale-switcher"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={activeLocale.label}
        >
          {activeLocale.flagSrc ? (
            <img
              src={activeLocale.flagSrc}
              alt=""
              className="size-5 rounded-full"
              loading="eager"
              decoding="async"
            />
          ) : (
            activeLocale.label
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" alignOffset={-4}>
        <DropdownMenuGroup>
          {locales.map((locale) => (
            <DropdownMenuItem
              data-slot="status-locale-switcher-item"
              key={locale.value}
              onClick={() => onValueChange(locale.value)}
            >
              {locale.flagSrc && (
                <img
                  src={locale.flagSrc}
                  alt=""
                  className="size-4 rounded-full"
                  loading="lazy"
                  decoding="async"
                />
              )}
              {locale.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * StatusLocaleSwitcherSkeleton — same footprint as the trigger button.
 * Render while the active locale isn't known yet (e.g. before next-intl
 * hydrates) so the surrounding layout doesn't shift.
 */
export function StatusLocaleSwitcherSkeleton({
  className,
  ...props
}: React.ComponentProps<typeof Skeleton>) {
  return (
    <Skeleton
      data-slot="status-locale-switcher-skeleton"
      className={cn("size-9", className)}
      {...props}
    />
  );
}
