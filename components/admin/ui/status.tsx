import type { ReactNode } from "react";
import {
  humanize, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, REFUND_STATUS_LABEL, REFUND_STATUS_TONE, STATUS_LABEL, STATUS_TONE,
  UNIT_STATUS_LABEL, UNIT_STATUS_TONE, type BookingStatus, type Tone, type UnitStatus,
} from "@/lib/admin/status";
import { cx } from "./button";

/**
 * A status chip: dot + label on a tinted pill. Use the typed chips below for known statuses so no raw
 * enum value ever reaches the screen. Tones: hold → warn; confirmed/preparing → info; with the renter →
 * field (indigo); collected/inspected → ok; disputed → bad; closed → solid; cancelled/expired → hollow.
 */
export function Chip({ tone = "neutral", children, size }: { tone?: Tone; children: ReactNode; size?: "lg" }) {
  // "field" would clash with the form .field class, so the indigo tone is .st.indigo in CSS.
  return <span className={cx("st", tone === "field" ? "indigo" : tone, size === "lg" && "lg")}>{children}</span>;
}

export function StatusChip({ status, size }: { status: BookingStatus; size?: "lg" }) {
  return <Chip tone={STATUS_TONE[status] ?? "neutral"} size={size}>{STATUS_LABEL[status] ?? humanize(status)}</Chip>;
}

export function PaymentStatusChip({ status }: { status: string }) {
  return <Chip tone={PAYMENT_STATUS_TONE[status] ?? "neutral"}>{PAYMENT_STATUS_LABEL[status] ?? humanize(status)}</Chip>;
}

export function RefundStatusChip({ status }: { status: string }) {
  return <Chip tone={REFUND_STATUS_TONE[status] ?? "neutral"}>{REFUND_STATUS_LABEL[status] ?? humanize(status)}</Chip>;
}

export function UnitStatusChip({ status }: { status: UnitStatus | string }) {
  return <Chip tone={UNIT_STATUS_TONE[status as UnitStatus] ?? "neutral"}>{UNIT_STATUS_LABEL[status as UnitStatus] ?? humanize(status)}</Chip>;
}

/** Small tone chip for yes/no style flags. */
export function Flag({ on, yes, no }: { on: boolean; yes: string; no?: string }) {
  return on ? <Chip tone="bad">{yes}</Chip> : no ? <span className="muted small">{no}</span> : null;
}

/** A count badge (nav, tabs). Not a status. */
export function Badge({ children, tone }: { children: ReactNode; tone?: "bad" | "warn" | "info" }) {
  return <span className="adm-count" data-tone={tone}>{children}</span>;
}

/** A plain label: category, direction, kind. Squarer than a chip, no dot. */
export function Tag({ children, kind, icon }: { children: ReactNode; kind?: "dir-out" | "dir-in" | "dir-base" | "late"; icon?: ReactNode }) {
  return <span className={cx("tag", kind)}>{icon}{children}</span>;
}
