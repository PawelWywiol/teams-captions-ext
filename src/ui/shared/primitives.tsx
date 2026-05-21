import type { ComponentChildren, JSX } from "preact";

type ButtonVariant = "default" | "primary" | "danger" | "ghost";

type ButtonProps = JSX.IntrinsicElements["button"] & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "default",
  class: extra,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const className = [variant !== "default" ? variant : "", extra ?? ""].filter(Boolean).join(" ");
  return (
    <button class={className || undefined} type="button" {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <div class="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <small class="muted">{hint}</small> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}): JSX.Element {
  return (
    <div class="empty">
      <strong>{title}</strong>
      {description ? <p class="muted">{description}</p> : null}
    </div>
  );
}

type StatusKind = "idle" | "capturing" | "analyzing" | "error";

export function StatusBadge({
  kind,
  children,
}: {
  kind: StatusKind;
  children: ComponentChildren;
}): JSX.Element {
  const variantClass = kind === "idle" ? "" : `is-${kind}`;
  return (
    <span class={`status-badge ${variantClass}`.trim()} role="status">
      {children}
    </span>
  );
}
