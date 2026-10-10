/**
 * The staff portal's component library (components/admin/ui/*), re-exported in one place. The older
 * names (StatusChip, Chip, PageHead, Empty, ErrorBox, Section, Flag) keep their props, so pages written
 * before the design system pick up the new look without edits.
 */
import type { ReactNode } from "react";
import { EmptyState, ErrorState } from "./ui/layout";

export { Button, ButtonLink, IconButton, IconLink, Spinner, btnClass, cx, type ButtonSize, type ButtonVariant } from "./ui/button";
export { Field, Input, Select, Textarea, Switch } from "./ui/field";
export { Badge, Chip, Flag, PaymentStatusChip, RefundStatusChip, StatusChip, Tag, UnitStatusChip } from "./ui/status";
export {
  ActiveFilters, Callout, Card, DescriptionList, EmptyState, ErrorState, Kpi, PageHead, Pagination, Section, SegmentedLinks, Skeleton,
  StageStepper, Tabs, Timeline, type Crumb, type TabItem, type TimelineItem,
} from "./ui/layout";
export { ConfirmProvider, Drawer, useConfirm, useDrawer, type ConfirmOptions, type DrawerTrigger } from "./ui/dialog";
export { ToastProvider, useToast } from "./ui/toast";
export { AutoSubmit, FilterBar, type FilterDate, type FilterSelect } from "./ui/filter-bar";

/** Older name for an empty list: one line of text. Prefer EmptyState (icon, title, line, action). */
export function Empty({ children }: { children: ReactNode }) {
  return <EmptyState compact title={children} />;
}

/** Older name for ErrorState. */
export function ErrorBox({ error, what = "this" }: { error: string; what?: string }) {
  return <ErrorState what={what} error={error} />;
}
