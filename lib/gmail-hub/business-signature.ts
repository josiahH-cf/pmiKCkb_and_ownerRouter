import {
  profileSignature,
  type StaffBusinessProfile,
} from "@/lib/staff/business-profile";
import {
  RichCommunicationMessageSchema,
  type RichCommunicationMessage,
} from "./sequence-model";
export function businessSignatureParagraph(profile: StaffBusinessProfile, email: string) {
  if (profile.email.toLowerCase() !== email.toLowerCase())
    throw Error("A signature must belong to its own managed sender.");
  const p = profileSignature(profile.profile);
  return [
    { text: p.name, bold: true },
    ...(p.role ? [{ text: "\n" + p.role }] : []),
    ...(p.phone ? [{ text: "\n" + p.phone }] : []),
    ...(p.hours ? [{ text: "\n" + p.hours }] : []),
    { text: "\n" + email, href: `mailto:${email}` },
    ...(p.website ? [{ text: "\n" + p.website.url, href: p.website.url }] : []),
  ];
}
/** A deliberate draft edit. Replace only a known exact terminal signature; never infer inline authored wording. */
export function applyBusinessSignature(
  message: RichCommunicationMessage,
  profile: StaffBusinessProfile,
  email: string,
  oldSignature?: string | null,
) {
  const paragraphs = [...message.paragraphs],
    last = paragraphs
      .at(-1)
      ?.map((r) => r.text)
      .join("");
  if (last === "[sender signature]" || (oldSignature && last === oldSignature))
    paragraphs.pop();
  const next = businessSignatureParagraph(profile, email);
  if (JSON.stringify(paragraphs.at(-1)) !== JSON.stringify(next)) paragraphs.push(next);
  return RichCommunicationMessageSchema.parse({ ...message, paragraphs });
}

/** Match only the complete terminal signature paragraph; an inline mention never establishes provenance. */
export function matchesBusinessSignature(
  message: RichCommunicationMessage,
  profile: StaffBusinessProfile,
  email: string,
) {
  return (
    profile.email.toLowerCase() === email.toLowerCase() &&
    JSON.stringify(message.paragraphs.at(-1)) ===
      JSON.stringify(businessSignatureParagraph(profile, email))
  );
}
