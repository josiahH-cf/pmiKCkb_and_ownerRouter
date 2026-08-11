/**
 * Client-safe domain error identity shared by pure contracts and server response adapters.
 * Keep framework, authentication, and Firebase imports out of this module so browser-safe models
 * can validate local inputs without pulling a server runtime into their bundle.
 */
export class EditableLayerError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = "EditableLayerError";
  }
}
