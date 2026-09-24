export type MailAddress = { name?: string; address: string };
export type AttachmentInfo = { gmailMessageId: string; attachmentId: string; filename: string; mimeType: string; size: number };
export type MailMessage = {
  gmailMessageId: string; gmailThreadId: string; rfcMessageId: string | null;
  references: string; replyTo: MailAddress[]; from: MailAddress;
  to: MailAddress[]; cc: MailAddress[]; bcc: MailAddress[];
  subject: string; snippet: string; date: string; text: string; html: string | null;
  unread: boolean; inbox: boolean; sent: boolean; spam: boolean; attachments: AttachmentInfo[];
};
export type MailThread = { gmailThreadId: string; messages: MailMessage[]; latest: MailMessage; unread: boolean };
export type MailPage = { threads: MailThread[]; nextPageToken?: string; resultSizeEstimate?: number };
