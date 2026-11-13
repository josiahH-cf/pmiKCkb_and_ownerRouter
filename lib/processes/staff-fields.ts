// S283 R-S283-3: the process form's two staff fields in staff words. The stored values
// (`owner_uid`, `default_approver_uid`) and who may edit them are unchanged; only the label and a
// hint that says what the value is and where an Admin finds it are added. Client-safe.

export const RUN_OWNER_FIELD_LABEL = "Run owner (staff account ID)";
export const RUN_OWNER_FIELD_HINT =
  "The account ID of the staff member who owns each new run of this process. An Admin finds each staff member's account ID in Admin, People and access.";

export const DEFAULT_APPROVER_FIELD_LABEL = "Default approver (staff account ID)";
export const DEFAULT_APPROVER_FIELD_HINT =
  "The account ID of the staff member who reviews each new run of this process. An Admin finds each staff member's account ID in Admin, People and access.";

/** The account ID line an Admin reads on each staff record in People and access. */
export function staffAccountIdLine(uid: string): string {
  return `Account ID ${uid}`;
}
