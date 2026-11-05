import { configure, getConfig } from "@testing-library/react";

/**
 * Test-only: keep testing-library's DOM dump out of the errors a polling check throws away
 * (Q-ENG-ADV-CI).
 *
 * testing-library builds every query error with `prettyDOM(container)`, which formats the whole
 * container and serializes its `outerHTML`. `waitFor` and `findBy*` switch off their other
 * expensive diagnostics while they poll, but not this one, so every failed check of a `screen`
 * query on the mounted lease page formats the entire document on the thread the in-process routes
 * share. Those errors are discarded. `waitFor`'s default timeout handler rebuilds the last one
 * outside the poll, so a timeout message still carries its DOM dump, and an error raised outside
 * a poll is unchanged.
 *
 * Returns a function that restores the previous error builder.
 */
export function installPollingErrorsWithoutDom(): () => void {
  const previous = getConfig().getElementError;
  configure({
    getElementError: (message, container) => {
      if (!polling()) return previous(message, container);
      const error = new Error(message ?? "");
      error.name = "TestingLibraryElementError";
      return error;
    },
  });
  return () => configure({ getElementError: previous });
}

/** testing-library's own flag for "inside a waitFor check". */
function polling() {
  return (
    (getConfig() as { _disableExpensiveErrorDiagnostics?: unknown })
      ._disableExpensiveErrorDiagnostics === true
  );
}
