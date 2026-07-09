// Client-safe assignee model (maintenance slice 2b). Just the minimal shape the picker needs — uid +
// email — with NO firebase-admin/server imports, so the queue component can share it without pulling the
// Admin SDK into the client bundle. The server roster module (lib/maintenance/assignees.ts) returns this
// shape; only the email is ever shown (never the raw uid), preserving the queue's privacy invariant.

export interface AssignableUser {
  uid: string;
  email: string;
}
