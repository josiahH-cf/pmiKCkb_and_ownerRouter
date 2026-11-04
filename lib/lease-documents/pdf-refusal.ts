// The typed refusal shared by the AcroForm and static PDF readers. A publication scanner maps its
// kind to a distinct outcome, so a refused original is never reported as a scanner outage.

import { EditableLayerError } from "@/lib/errors/editable-layer-error";

/**
 * `unsupported`: the bytes are not a complete, parseable, unencrypted PDF within the supported
 * bounds, or carry active content, attachments, XFA or protection the readers never interpret.
 * `undecodable`: the PDF parsed, but its text, streams or structure cannot be completely and
 * exactly inspected, so no clean reading can be claimed for it.
 */
export type PdfRefusalKind = "unsupported" | "undecodable";

export class PdfRefusalError extends EditableLayerError {
  constructor(
    message: string,
    public readonly kind: PdfRefusalKind,
  ) {
    super(message, 409);
    this.name = "PdfRefusalError";
  }
}
