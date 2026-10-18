import type { ThreadMessage } from "@/types";

/**
 * What an appointment's card mentions of its thread: the latest message, but only once anything
 * (from anyone) came after the landlord's first message, the invitation. Null otherwise.
 * `messages` are oldest first.
 */
export function followUp(messages: ThreadMessage[]): ThreadMessage | null {
  const invitation = messages.findIndex((message) => message.from === "landlord");
  if (invitation === -1 || invitation === messages.length - 1) return null;
  return messages[messages.length - 1];
}

/** A run of a message body: plain text, or a web address to link to. */
export type BodyPart = { text: string; href?: string };

// An http(s) or www. address, up to whitespace; punctuation ending a sentence is not part of it.
const WEB_ADDRESS = /\b(?:https?:\/\/|www\.)[^\s<>"]*[^\s<>".,;:!?)'\]]/gi;

/**
 * Splits a plain-text body into text and links, for a template to render without `v-html`.
 * Only http(s) and www. addresses become links.
 */
export function withLinks(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let from = 0;
  for (const match of body.matchAll(WEB_ADDRESS)) {
    if (match.index > from) parts.push({ text: body.slice(from, match.index) });
    const address = match[0];
    parts.push({ text: address, href: /^https?:\/\//i.test(address) ? address : `https://${address}` });
    from = match.index + address.length;
  }
  if (from < body.length) parts.push({ text: body.slice(from) });
  return parts;
}

/** Who wrote a message, as the thread and the card name them. */
export function senderLabel(message: ThreadMessage, t: (key: string) => string): string {
  if (message.from === "landlord") return message.senderName ?? t("appointments.thread.landlord");
  return t(`appointments.thread.${message.from}`);
}
