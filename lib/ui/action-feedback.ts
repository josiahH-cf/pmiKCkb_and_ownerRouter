import { waitFailureMessage } from "./fetch-lifetime";
/** Only deliberately user-facing validation and sanitized HTTP responses use this type.
 * Network/runtime exceptions keep outcome-unknown wording instead of exposing raw errors. */
export class UserActionError extends Error {
  constructor(message: string) {
    super(message.slice(0, 4000));
    this.name = "UserActionError";
  }
}
export function actionFailureMessage(error: unknown, fallback: string) {
  return error instanceof UserActionError
    ? error.message
    : waitFailureMessage(error, fallback);
}
