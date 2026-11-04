export interface HelpCopyItem {
  kind: "inline" | "infotip" | "process-guide";
  location: string;
  text: string;
}
export function normalizeCopy(text: string): string;
export function inventoryHelpCopy(root?: string): HelpCopyItem[];
