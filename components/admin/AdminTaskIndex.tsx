import Link from "next/link";

import { ADMIN_TASK_GROUPS } from "@/lib/navigation/admin-connections";

/** Pure navigation over existing Admin and Connections destinations. It grants no capability. */
export function AdminTaskIndex() {
  return (
    <section
      aria-labelledby="admin-task-index-title"
      className="panel ui-stack task-anchor"
      id="admin-task-index"
      tabIndex={-1}
    >
      <div>
        <h2 id="admin-task-index-title">Find an Admin task</h2>
        <p className="muted">
          These links organize existing controls. They do not change roles, connection
          truth, or action authority.
        </p>
      </div>
      <div className="task-navigation-grid">
        {ADMIN_TASK_GROUPS.map((group) => (
          <section
            aria-labelledby={`admin-task-group-${group.id}`}
            className="task-navigation-card"
            key={group.id}
          >
            <h3 id={`admin-task-group-${group.id}`}>{group.label}</h3>
            <p className="muted">{group.description}</p>
            <ul className="compact-list">
              {group.links.map((link) => (
                <li key={link.id}>
                  <Link href={link.href}>{link.label}</Link>
                  <span className="muted">{link.description}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
