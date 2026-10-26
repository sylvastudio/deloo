import Link from "next/link";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { type ComponentProps, type ReactElement, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * An icon prop on a client component (Submit, Drawer). Server components must pass a rendered element
 * (`icon={<Plus />}`): a lucide component itself is a function and can't cross into a client component,
 * which crashes the whole page. Client callers may still pass the component.
 */
export type IconProp = LucideIcon | ReactElement;
export function iconNode(icon: IconProp | undefined): ReactNode {
  if (!icon) return null;
  // Only a component (a function, or a forwardRef object like every lucide icon) gets rendered here.
  // Anything else is already a node: an element, or the lazy wrapper React's server payload uses for an
  // element passed as a prop. isValidElement is false for that wrapper, and rendering it as <Icon />
  // throws "Element type is invalid … got: object", which broke Settings.
  const component = typeof icon === "function" || (typeof icon === "object" && "render" in icon);
  if (!component) return icon as ReactNode;
  const Icon = icon as LucideIcon;
  return <Icon aria-hidden="true" />;
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "", secondary: "btn-secondary", ghost: "btn-ghost", danger: "btn-danger", accent: "btn-accent", "danger-ghost": "btn-danger-ghost",
};

/** The class list for a button-looking element (also for links and <summary>). */
export function btnClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cx("btn", VARIANT[variant], size === "sm" && "btn-sm", size === "lg" && "btn-lg", extra);
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle className="spin" width={size} height={size} aria-hidden="true" />;
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; iconEnd?: LucideIcon; block?: boolean };

/**
 * Button. `pending` keeps the label (so the width doesn't jump) and swaps the icon for a spinner.
 * Variants: primary (lagoon), secondary, ghost, danger, accent (marigold: the one main action on a phone screen).
 */
export function Button({ variant, size, icon: Icon, iconEnd: IconEnd, block, pending, className, children, disabled, type = "button", ...rest }:
  Common & ComponentProps<"button"> & { pending?: boolean }) {
  return (
    <button type={type} className={btnClass(variant, size, cx(block && "btn-block", className))} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {pending ? <Spinner /> : Icon ? <Icon aria-hidden="true" /> : null}
      {children}
      {IconEnd && <IconEnd aria-hidden="true" />}
    </button>
  );
}

/** A link styled as a button. */
export function ButtonLink({ variant, size, icon: Icon, iconEnd: IconEnd, block, className, children, ...rest }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={btnClass(variant, size, cx(block && "btn-block", className))} {...rest}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
      {IconEnd && <IconEnd aria-hidden="true" />}
    </Link>
  );
}

/** Square icon-only button. `label` is required: it is the accessible name and the tooltip. */
export function IconButton({ icon: Icon, label, variant = "ghost", size, className, type = "button", pending, ...rest }:
  { icon: LucideIcon; label: string; variant?: ButtonVariant; size?: ButtonSize; pending?: boolean } & Omit<ComponentProps<"button">, "children">) {
  return (
    <button type={type} className={btnClass(variant, size, cx("icon-btn", variant === "ghost" && "neutral", className))} aria-label={label} title={label}
      {...rest} disabled={rest.disabled || pending} aria-busy={pending || undefined}>
      {pending ? <Spinner /> : <Icon aria-hidden="true" />}
    </button>
  );
}

/** Icon-only link (external links get rel="noreferrer"). */
export function IconLink({ icon: Icon, label, variant = "ghost", size, className, href, external, children }:
  { icon: LucideIcon; label: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; href: string; external?: boolean; children?: ReactNode }) {
  const cls = btnClass(variant, size, cx("icon-btn", variant === "ghost" && "neutral", className));
  if (external || /^(https?:|tel:|mailto:)/.test(href)) {
    return <a className={cls} href={href} aria-label={label} title={label} target={/^https?:/.test(href) ? "_blank" : undefined} rel="noreferrer"><Icon aria-hidden="true" />{children}</a>;
  }
  return <Link className={cls} href={href} aria-label={label} title={label}><Icon aria-hidden="true" />{children}</Link>;
}
