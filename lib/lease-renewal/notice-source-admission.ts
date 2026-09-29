/** In-memory proof of the exact lease markers included before this provider fetch began.
 * These hashes are never accepted from a browser or written as provider/workflow facts.
 */
export interface NoticeSourceAdmission {
  readAtMs: number;
  leaseKeys: readonly string[];
}

// Context is private metadata, never a snapshot field, DTO, receipt, or durable proof value.
const configuredReaderScopes = new WeakMap<object, object>();
const admissionContexts = new WeakMap<NoticeSourceAdmission, object>();
const storeContexts = new WeakMap<object, WeakMap<object, object>>();

/** Only the verified live-config factory supplies this process-local provider scope. */
export function registerConfiguredNoticeReaderScope(reader: object, scope: object): void {
  configuredReaderScopes.set(reader, scope);
}
export function configuredNoticeReaderScope(reader: object): object {
  return configuredReaderScopes.get(reader) ?? reader;
}
export function inheritNoticeReaderScope(wrapper: object, reader: object): void {
  configuredReaderScopes.set(wrapper, configuredNoticeReaderScope(reader));
}
export function noticeAdmissionContextFor(store: object, reader: object): object {
  let readers = storeContexts.get(store);
  if (!readers) {
    readers = new WeakMap();
    storeContexts.set(store, readers);
  }
  const provider = configuredNoticeReaderScope(reader);
  let context = readers.get(provider);
  if (!context) {
    context = {};
    readers.set(provider, context);
  }
  return context;
}
export function bindNoticeAdmissionContext(
  admission: NoticeSourceAdmission,
  context: object,
): NoticeSourceAdmission {
  admissionContexts.set(admission, context);
  return admission;
}
export function noticeAdmissionContext(
  admission: NoticeSourceAdmission,
): object | undefined {
  return admissionContexts.get(admission);
}
