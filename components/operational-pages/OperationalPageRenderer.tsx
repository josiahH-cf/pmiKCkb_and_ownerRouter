import Link from "next/link";

import type { OperationalPageDefinition } from "@/lib/operational-pages/schema";

/** Strict React renderer. Plain strings are escaped by React; no raw HTML/code/style surface exists. */
export function OperationalPageRenderer({
  definition,
  preview = false,
}: Readonly<{ definition: OperationalPageDefinition; preview?: boolean }>) {
  return (
    <article className="panel ui-stack operational-process-page">
      <div className="ui-spread">
        <h1 className="section-title">{definition.title}</h1>
        {preview ? <span className="review-pill">Exact preview</span> : null}
      </div>
      {definition.components.map((component, index) => {
        const key = `${index}:${component.type}`;
        switch (component.type) {
          case "heading":
            return component.level === "2" ? (
              <h2 key={key}>{component.text}</h2>
            ) : (
              <h3 key={key}>{component.text}</h3>
            );
          case "text":
            return <p key={key}>{component.text}</p>;
          case "callout":
            return (
              <section
                className={`notice ${component.tone === "warning" ? "notice-warning" : ""}`}
                key={key}
              >
                <strong>{component.title}</strong>
                <p>{component.text}</p>
              </section>
            );
          case "checklist":
            return (
              <section className="ui-stack-tight" key={key}>
                <h3>{component.title}</h3>
                <ul className="compact-list">
                  {component.items.map((item) => (
                    <li key={item}>☐ {item}</li>
                  ))}
                </ul>
              </section>
            );
          case "internal_link":
            return (
              <p key={key}>
                <Link href={component.href}>{component.label}</Link>
              </p>
            );
        }
      })}
    </article>
  );
}
