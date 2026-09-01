import type { AnchorHTMLAttributes } from "react";

import { Icon } from "./Icon";

interface ActionLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  external?: boolean;
  presentation?: "inline" | "row" | "button";
  staticReference?: boolean;
}

export function ActionLink({
  children,
  className,
  external = false,
  presentation = "inline",
  rel,
  staticReference = false,
  target,
  ...anchorProps
}: Readonly<ActionLinkProps>) {
  const classes = [
    "action-link",
    `action-link--${presentation}`,
    staticReference ? "action-link--visited" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const externalRel = external
    ? [...new Set(`${rel ?? ""} noopener noreferrer`.trim().split(/\s+/))].join(" ")
    : rel;

  return (
    <a
      {...anchorProps}
      className={classes}
      rel={externalRel}
      target={external ? "_blank" : target}
    >
      <span>{children}</span>
      {external ? (
        <>
          <Icon name="external" size={16} />
          <span className="sr-only">Opens in a new tab</span>
        </>
      ) : presentation === "row" ? (
        <Icon name="chevron-right" size={18} />
      ) : null}
    </a>
  );
}
