import Link from "next/link";
import { launchSpaces, spaceHref, type LaunchSpace } from "@/lib/spaces";

function groupByCategory(
  spaces: readonly LaunchSpace[],
): Array<[string, LaunchSpace[]]> {
  const groups = new Map<string, LaunchSpace[]>();
  for (const space of spaces) {
    const list = groups.get(space.processCategory) ?? [];
    list.push(space);
    groups.set(space.processCategory, list);
  }
  return [...groups.entries()];
}

/**
 * The operations-console home — the front door of the multi-process app. A natural-language Console
 * (answers today; launches workflows in a later slice) plus a Spaces dropdown to open any process.
 * Lease Renewals is process #1, not the whole app. Driven by the launchSpaces catalog.
 */
export function OperationsConsoleHome() {
  const groups = groupByCategory(launchSpaces);

  return (
    <section className="content">
      <h1 className="section-title">Operations Console</h1>
      <p className="muted">
        Ask a grounded question, or open a space to run a process.
      </p>

      <div className="grid two">
        <article className="panel">
          <h2>Console</h2>
          <p className="muted">
            Ask a question and get an answer that cites approved sources.
          </p>
          <Link className="text-link" href="/ask">
            Open the Console
          </Link>
        </article>

        <article className="panel">
          <h2>Spaces</h2>
          <p className="muted">Choose a space to work in.</p>
          <details className="ui-disclosure">
            <summary>Browse spaces</summary>
            <div className="ui-disclosure-body">
              {groups.map(([category, spaces]) => (
                <div key={category}>
                  <p className="muted">{category}</p>
                  <ul>
                    {spaces.map((space) => (
                      <li key={space.id}>
                        <Link className="text-link" href={spaceHref(space)}>
                          {space.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </article>
      </div>
    </section>
  );
}
