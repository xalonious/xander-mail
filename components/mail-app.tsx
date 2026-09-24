"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Inbox, LoaderCircle, Mail, Paperclip, PenLine, RefreshCw, Search, Send, X } from "lucide-react";
import type { MailPage, MailThread } from "@/lib/types";

type Folder = "inbox" | "sent";
type ComposeState = { mode: "new" | "reply"; threadId?: string; messageId?: string; to: string; cc: string; bcc: string; subject: string; body: string };
type SendState = { delivered: boolean; savedInGmail: boolean; retryKey?: string; saveError?: string; sendError?: string };
type MailAppProps = { fromAddress: string; fromName: string };
const initialCompose: ComposeState = { mode: "new", to: "", cc: "", bcc: "", subject: "", body: "" };

function timeLabel(date: string) {
  const value = new Date(date);
  const today = new Date();
  return value.toDateString() === today.toDateString()
    ? value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : value.toLocaleDateString([], { month: "short", day: "numeric", year: value.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function correspondent(thread: MailThread, folder: Folder, fromAddress: string): string {
  if (folder === "sent") {
    const sent = [...thread.messages].reverse().find((message) => message.from.address.toLowerCase() === fromAddress);
    const recipient = sent?.to.find((item) => item.address.toLowerCase() !== fromAddress);
    if (recipient) return recipient.name || recipient.address;
  }
  const sender = [...thread.messages].reverse().find((message) => message.from.address.toLowerCase() !== fromAddress)?.from;
  return sender?.name || sender?.address || thread.latest.from.name || thread.latest.from.address;
}

async function json<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.sendError || "Request failed.");
  return data as T;
}

export default function MailApp({ fromAddress, fromName }: MailAppProps) {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<MailPage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<MailThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState<SendState | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(async (append = false, token?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ folder, q: search });
      if (token) params.set("pageToken", token);
      const result = await json<MailPage>(await fetch(`/api/mail?${params}`, { cache: "no-store" }));
      setPage((previous) => append && previous
        ? { ...result, threads: [...previous.threads, ...result.threads] }
        : result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load mail."); }
    finally { setLoading(false); }
  }, [folder, search]);

  useEffect(() => {
    const timer = setTimeout(() => void loadPage(), 0);
    return () => clearTimeout(timer);
  }, [loadPage, refresh]);

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id);
    setThreadLoading(true);
    setThread(null);
    setError("");
    try {
      const result = await json<MailThread>(await fetch(`/api/threads/${id}`, { cache: "no-store" }));
      setThread(result);
      if (result.unread) {
        void fetch(`/api/threads/${id}/actions`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read" }),
        }).then(async (response) => {
          await json(response);
          setThread((current) => current?.gmailThreadId === id ? { ...current, unread: false } : current);
          setPage((old) => old ? { ...old, threads: old.threads.map((item) => item.gmailThreadId === id ? { ...item, unread: false } : item) } : old);
        }).catch(() => setError("Could not mark conversation as read."));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load thread."); }
    finally { setThreadLoading(false); }
  }, []);

  async function act(action: "read" | "unread") {
    if (!thread) return;
    const id = thread.gmailThreadId;
    try {
      await json(await fetch(`/api/threads/${id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      }));
      setThread({ ...thread, unread: action === "unread" });
      setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update Gmail."); }
  }

  function startReply() {
    if (!thread) return;
    const target = thread.latest;
    const recipient = target.replyTo[0]?.address || (target.from.address === fromAddress ? target.to.find((item) => item.address !== fromAddress)?.address : target.from.address) || "";
    setCompose({
      mode: "reply", threadId: thread.gmailThreadId, messageId: target.gmailMessageId,
      to: recipient, cc: "", bcc: "", subject: /^re\s*:/i.test(target.subject) ? target.subject : `Re: ${target.subject}`, body: "",
    });
    setFiles([]);
    setSendState(null);
  }

  async function sendMessage() {
    if (!compose || sending) return;
    setSending(true);
    setError("");
    const form = new FormData();
    for (const field of ["to", "cc", "bcc", "subject", "body"] as const) form.set(field, compose[field]);
    files.forEach((file) => form.append("attachments", file));
    const headers: Record<string, string> = { "x-idempotency-key": crypto.randomUUID() };
    if (compose.mode === "reply" && compose.threadId && compose.messageId) {
      headers["x-reply-thread-id"] = compose.threadId;
      headers["x-reply-message-id"] = compose.messageId;
    }
    try {
      const response = await fetch("/api/send", { method: "POST", headers, body: form });
      const result = await response.json() as SendState & { error?: string };
      if (!response.ok && !result.sendError) throw new Error(result.error || "Sending failed.");
      setSendState(result);
      if (result.sendError) { setError(result.sendError); return; }
      if (result.delivered && result.savedInGmail) {
        setNotice("Message sent and saved to Gmail.");
        setCompose(null);
        setRefresh((value) => value + 1);
        if (compose.threadId) void openThread(compose.threadId);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sending failed. Check Brevo before retrying."); }
    finally { setSending(false); }
  }

  async function retrySentCopy() {
    if (!sendState?.retryKey) return;
    try {
      const result = await json<SendState>(await fetch("/api/send/sent-copy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryKey: sendState.retryKey }),
      }));
      setSendState(result);
      setNotice("Sent copy saved to Gmail.");
      setCompose(null);
      setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the sent copy."); }
  }

  const navigation = [
    { key: "inbox", label: "Inbox", icon: Inbox },
    { key: "sent", label: "Sent", icon: Send },
  ] as const;

  return (
    <main className="mail-shell min-h-dvh bg-white text-[var(--ink)]" data-thread-open={Boolean(selectedId && (thread || threadLoading))}>
      <header className="flex h-16 items-center justify-between border-b border-[var(--line)] px-[26px] max-[730px]:h-[58px] max-[730px]:px-4">
        <div className="flex min-w-0 items-center gap-3"><span className="grid size-[31px] place-items-center rounded-md border border-[#cfd5d8] font-serif text-[21px] font-semibold leading-none text-[#354b68]" aria-hidden="true">x</span><div className="flex min-w-0 flex-col"><strong className="text-sm font-semibold leading-tight tracking-[-.015em]">Xander Mail</strong><span className="text-[11px] leading-[1.4] text-[var(--muted)] max-[520px]:hidden">{fromAddress}</span></div></div>
      </header>
      <div className="grid h-[calc(100dvh-64px)] min-h-[550px] grid-cols-[208px_minmax(320px,370px)_minmax(0,1fr)] max-[1050px]:grid-cols-[66px_minmax(300px,350px)_minmax(0,1fr)] max-[730px]:h-[calc(100dvh-58px)] max-[730px]:min-h-0 max-[730px]:grid-cols-[minmax(0,1fr)] max-[730px]:grid-rows-[55px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col border-r border-[var(--line)] bg-[#f8f9f9] px-[13px] pb-4 pt-6 max-[1050px]:items-center max-[1050px]:px-2 max-[1050px]:py-5 max-[730px]:flex-row max-[730px]:items-center max-[730px]:justify-between max-[730px]:border-b max-[730px]:border-r-0 max-[730px]:px-[15px] max-[730px]:py-0">
          <button className="mx-[6px] mb-[30px] flex min-h-[39px] items-center justify-center gap-[9px] whitespace-nowrap rounded-md border border-[#243b5c] bg-[#243b5c] px-[13px] text-[13px] font-semibold text-white hover:bg-[#304f79] max-[1050px]:mx-0 max-[1050px]:mb-[27px] max-[1050px]:min-h-10 max-[1050px]:w-10 max-[1050px]:px-0 max-[730px]:mb-0 max-[730px]:min-h-[33px] max-[730px]:w-auto max-[730px]:px-[11px]" onClick={() => { setCompose({ ...initialCompose }); setFiles([]); setSendState(null); }}><PenLine size={17} strokeWidth={1.8} /><span className="max-[1050px]:hidden max-[730px]:inline">New message</span></button>
          <div className="mx-[13px] mb-[10px] text-[10px] font-bold tracking-[.1em] text-[#9aa1a4] max-[1050px]:hidden">MAIL</div>
          <nav className="flex flex-col gap-[3px] max-[1050px]:w-full max-[730px]:w-auto max-[730px]:flex-row max-[730px]:gap-1" aria-label="Mail folders">
            {navigation.map((item) => <button key={item.key} className={`flex min-h-[38px] w-full items-center gap-3 rounded-md border-0 px-[13px] text-left text-[13px] max-[1050px]:justify-center max-[1050px]:px-0 max-[730px]:min-h-[33px] max-[730px]:w-auto max-[730px]:gap-[6px] max-[730px]:px-[10px] max-[730px]:text-[11px] ${folder === item.key ? "bg-[#e8eef7] font-semibold text-[#244a7f]" : "bg-transparent font-medium text-[#596267] hover:bg-[#eff1f2]"}`} aria-current={folder === item.key ? "page" : undefined} onClick={() => { setFolder(item.key); setSelectedId(null); setThread(null); }}>
              <item.icon size={17} strokeWidth={1.8} /><span className="max-[1050px]:hidden max-[730px]:inline">{item.label}</span>
            </button>)}
          </nav>
        </aside>
        <section className="list-panel flex min-h-0 min-w-0 flex-col border-r border-[var(--line)] max-[730px]:border-r-0" aria-label={`${folder} conversations`}>
          <div className="flex h-[90px] min-h-[90px] items-end justify-between px-[21px] pb-[15px] pt-[22px]">
            <div><span className="text-[10px] font-bold tracking-[.1em] text-[#929a9d]">MAILBOX</span><h1 className="mt-1 text-[23px] font-semibold leading-[1.1] tracking-[-.035em]">{navigation.find((item) => item.key === folder)?.label}</h1></div>
            <button className="inline-grid size-[34px] shrink-0 place-items-center rounded-md border-0 bg-transparent text-[#687277] hover:bg-[#f0f2f3] hover:text-[#263d5d]" title="Refresh" aria-label="Refresh conversations" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={17} /></button>
          </div>
          <label className="mx-5 mb-4 flex h-9 items-center gap-[9px] rounded-md border border-[#dfe3e5] bg-[#f8f9fa] px-[11px] text-[#879096] focus-within:border-[#8aabd7] focus-within:ring-2 focus-within:ring-[#e9f1fc]"><Search size={16} /><input className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--ink)] outline-none placeholder:text-[#a0a8ac]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label>
          <div className="min-h-[31px] border-b border-[var(--line)] px-[21px] pb-[11px] text-[11px] text-[#949ca0]">{loading ? "Updating…" : `${page?.resultSizeEstimate ?? page?.threads.length ?? 0} conversations`}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !page ? <div className="px-5">{[1, 2, 3, 4].map((item) => <div key={item} className="h-[90px] animate-[shimmer_1.5s_infinite] border-b border-[var(--line)] bg-[linear-gradient(90deg,#fff,#f7f8f9,#fff)] bg-[length:200%_100%]" />)}</div> : null}
            {!loading && !page && error ? <div className="flex flex-col items-center px-7 py-[60px] text-center text-[#9da5a9]"><CircleAlert size={22} /><strong className="mt-4 text-[13px] text-[#454e53]">Mailbox unavailable</strong><p className="mt-[7px] max-w-[220px] text-xs leading-normal">{error}</p><button className="mt-[17px] inline-flex min-h-8 items-center justify-center gap-[7px] rounded-md border border-[#d9dfe2] bg-white px-3 text-[11px] font-semibold text-[#485b6b] hover:border-[#c8d1d6] hover:bg-[#f6f8f9]" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div> : null}
            {!loading && page?.threads.length === 0 ? <div className="flex flex-col items-center px-7 py-[60px] text-center text-[#9da5a9]"><Mail size={23} /><strong className="mt-4 text-[13px] text-[#454e53]">Nothing here yet</strong><p className="mt-[7px] max-w-[220px] text-xs leading-normal">{search ? "Try a different search." : "Conversations will appear here when they arrive."}</p></div> : null}
            {page?.threads.map((item) => <button key={item.gmailThreadId} onClick={() => void openThread(item.gmailThreadId)} className={`block min-h-24 w-full border-0 border-b border-l-[3px] border-b-[#edf0f1] py-[14px] pl-[17px] pr-[19px] text-left text-[var(--ink)] ${selectedId === item.gmailThreadId ? "border-l-[var(--blue)] bg-[#f1f5fb]" : "border-l-transparent bg-white hover:bg-[#f8fafc]"}`}>
              <span className="flex min-w-0 items-center justify-between gap-2"><span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] ${item.unread ? "font-bold text-[#151b1e]" : "font-medium text-[#31383c]"}`}>{correspondent(item, folder, fromAddress)}</span><time className="shrink-0 text-[11px] text-[#929b9f]" dateTime={item.latest.date}>{timeLabel(item.latest.date)}</time></span>
              <span className={`mt-[6px] block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] ${item.unread ? "font-bold text-[#151b1e]" : "font-medium"}`}>{item.latest.subject}{item.messages.length > 1 ? <span className="font-normal text-[#9ba2a6]"> · {item.messages.length}</span> : null}</span>
              <span className="mt-[5px] flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#818a8e]">{item.latest.from.address.toLowerCase() === fromAddress ? "You: " : ""}{item.latest.snippet}</span>{folder === "inbox" && item.messages.some((message) => message.spam) ? <span className="shrink-0 text-[10px] font-semibold text-[#a25c22]">Spam</span> : null}{item.unread ? <span className="size-[6px] shrink-0 rounded-full bg-[var(--blue)]" aria-label="Unread" /> : null}</span>
            </button>)}
            {page?.nextPageToken ? <button className="flex w-full items-center justify-center gap-[6px] border-0 bg-white p-[15px] text-xs font-semibold text-[var(--blue)] hover:bg-[#f7f9fb]" onClick={() => void loadPage(true, page.nextPageToken)} disabled={loading}>{loading ? "Loading…" : "Load more"} <ArrowRight size={14} /></button> : null}
          </div>
        </section>
        <section className="detail-panel min-h-0 min-w-0 overflow-y-auto bg-white max-[730px]:hidden" aria-label="Conversation">
          {threadLoading ? <div className="flex min-h-full flex-col items-center justify-center text-center text-[#a0a8ac]"><LoaderCircle className="animate-spin" size={23} /></div> : null}
          {!thread && !threadLoading ? <div className="flex min-h-full flex-col items-center justify-center text-center text-[#a0a8ac] max-[730px]:min-h-[300px]"><div className="grid size-[53px] place-items-center rounded-full border border-[#e4e8ea] text-[#9ba6ac]"><Mail size={25} strokeWidth={1.4} /></div><h2 className="mt-[18px] text-[15px] font-semibold text-[#4c555a]">Select a conversation</h2><p className="mt-[7px] text-xs">Choose a message from the list to read it here.</p></div> : null}
          {thread && !threadLoading ? <div className="mx-auto max-w-[900px] px-[38px] pb-16 max-[1050px]:px-[26px] max-[730px]:px-[22px] max-[730px]:pb-[50px]">
            <div className="flex h-[62px] items-center justify-between border-b border-[var(--line)] max-[730px]:h-[52px]"><button className="flex items-center gap-2 border-0 bg-transparent px-0 py-[7px] text-xs font-medium capitalize text-[#63717a] hover:text-[var(--blue)]" onClick={() => { setThread(null); setSelectedId(null); }}><ArrowLeft size={16} /> <span>Back to {folder}</span></button><button className="inline-grid size-[34px] shrink-0 place-items-center rounded-md border-0 bg-transparent text-[#687277] hover:bg-[#f0f2f3] hover:text-[#263d5d]" title={thread.unread ? "Mark read" : "Mark unread"} aria-label={thread.unread ? "Mark read" : "Mark unread"} onClick={() => void act(thread.unread ? "read" : "unread")}><Mail size={17} /></button></div>
            <div className="border-b border-[var(--line)] pb-[26px] pt-[31px] max-[730px]:pt-6"><span className="text-[10px] font-bold tracking-[.1em] text-[#929a9d]">CONVERSATION</span><h2 className="mt-[9px] break-words text-[clamp(23px,2vw,30px)] font-semibold leading-[1.25] tracking-[-.04em]">{thread.latest.subject}</h2><p className="mt-[10px] text-[11px] text-[#8b9498]">{thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} <span className="mx-[5px]" aria-hidden="true">·</span> Last activity {timeLabel(thread.latest.date)}</p></div>
            <div>{thread.messages.map((message, index) => <article key={message.gmailMessageId} className="border-b border-[var(--line)] pb-[30px] pt-[26px]">
              <div className="flex items-start gap-[11px]"><span className="grid size-[34px] shrink-0 place-items-center rounded bg-[#edf0f2] text-[13px] font-semibold text-[#53616b]" aria-hidden="true">{(message.from.name || message.from.address)[0].toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3 max-[520px]:items-start"><strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold">{message.from.name || message.from.address}</strong><time className="shrink-0 text-[11px] text-[#8c969a] max-[520px]:text-[10px]" dateTime={message.date}>{timeLabel(message.date)}</time></div><p className="mt-1 break-words text-[11px] leading-normal text-[#8a9499]">From {message.from.address} <span className="mx-[3px]" aria-hidden="true">·</span> To {message.to.map((item) => item.address).join(", ")}</p>{message.cc.length ? <p className="mt-1 break-words text-[11px] leading-normal text-[#8a9499]">Cc {message.cc.map((item) => item.address).join(", ")}</p> : null}</div></div>
              <div className="mt-[26px] break-words text-sm leading-[1.7] text-[#30383c]">{message.html ? <div className="message-html break-words leading-[1.7]" dangerouslySetInnerHTML={{ __html: message.html }} /> : <div className="whitespace-pre-wrap">{message.text || message.snippet}</div>}</div>
              {message.attachments.length ? <div className="mt-[22px] flex flex-wrap gap-2">{message.attachments.map((attachment) => <a key={attachment.attachmentId} href={`/api/messages/${attachment.gmailMessageId}/attachments/${attachment.attachmentId}`} className="inline-flex min-h-[33px] max-w-full items-center gap-2 rounded-md border border-[#dfe4e6] px-[10px] text-[11px] text-[#3f586d] no-underline hover:bg-[#f7f9fa]"><Paperclip size={14} /><span className="overflow-hidden text-ellipsis whitespace-nowrap">{attachment.filename}</span><small className="shrink-0 text-[10px] text-[#98a1a5]">{Math.ceil(attachment.size / 1024)} KB</small></a>)}</div> : null}
              {index === thread.messages.length - 1 ? <button className="mt-[27px] inline-flex min-h-8 items-center justify-center gap-[7px] rounded-md border border-[#d9dfe2] bg-white px-3 text-[11px] font-semibold text-[#485b6b] hover:border-[#c8d1d6] hover:bg-[#f6f8f9]" onClick={startReply}><ArrowLeft size={15} /> Reply</button> : null}
            </article>)}</div>
          </div> : null}
        </section>
      </div>
      {(error || notice) ? <div className={`fixed bottom-[22px] left-1/2 z-50 flex max-w-[min(520px,92vw)] -translate-x-1/2 items-center gap-[10px] rounded-md px-[13px] py-[11px] text-xs text-white shadow-[0_8px_26px_#20242626] ${error ? "bg-[#884139]" : "bg-[#263d5c]"}`} role="status">{error ? <CircleAlert size={17} /> : <Check size={17} />}<span>{error || notice}</span><button className="ml-auto border-0 bg-transparent p-0.5 text-inherit" aria-label="Dismiss notification" onClick={() => { setError(""); setNotice(""); }}><X size={15} /></button></div> : null}
      {compose ? <div className="fixed inset-0 z-40 flex items-end justify-end bg-[#1e273b55] p-6 max-[520px]:p-0" onClick={(event) => { if (event.target === event.currentTarget && !sending) setCompose(null); }}>
        <div className="flex h-[min(740px,calc(100dvh-48px))] w-[min(600px,100%)] flex-col overflow-hidden rounded-[7px] border border-[#cdd4d8] bg-white shadow-[0_20px_60px_#10182038] max-[520px]:h-dvh max-[520px]:w-full max-[520px]:rounded-none max-[520px]:border-0" role="dialog" aria-modal="true" aria-label={compose.mode === "reply" ? "Reply" : "New message"}>
          <div className="flex min-h-[68px] items-center justify-between border-b border-[var(--line)] px-[21px] max-[520px]:px-4"><div className="flex flex-col gap-[3px]"><strong className="text-sm font-semibold">{compose.mode === "reply" ? "Reply" : "New message"}</strong><span className="text-[11px] text-[#899297]">From {fromName} &lt;{fromAddress}&gt;</span></div><button className="inline-grid size-[34px] shrink-0 place-items-center rounded-md border-0 bg-transparent text-[#687277] hover:bg-[#f0f2f3] hover:text-[#263d5d]" aria-label="Close composer" disabled={sending} onClick={() => setCompose(null)}><X size={18} /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-[21px] pb-5 pt-[5px] max-[520px]:px-4">
            <label className="flex min-h-[43px] items-center gap-[13px] border-b border-[#edf0f1] focus-within:border-[#8aabd7]"><span className="w-[52px] shrink-0 text-xs text-[#7c868b]">To</span><input className="h-[38px] min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--ink)] outline-none placeholder:text-[#a2aaae] focus-visible:outline-none" value={compose.to} disabled={compose.mode === "reply" || sending} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="name@example.com, another@example.com" /></label>
            {compose.mode === "new" ? <><label className="flex min-h-[43px] items-center gap-[13px] border-b border-[#edf0f1] focus-within:border-[#8aabd7]"><span className="w-[52px] shrink-0 text-xs text-[#7c868b]">Cc</span><input className="h-[38px] min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--ink)] outline-none focus-visible:outline-none" value={compose.cc} disabled={sending} onChange={(event) => setCompose({ ...compose, cc: event.target.value })} /></label><label className="flex min-h-[43px] items-center gap-[13px] border-b border-[#edf0f1] focus-within:border-[#8aabd7]"><span className="w-[52px] shrink-0 text-xs text-[#7c868b]">Bcc</span><input className="h-[38px] min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--ink)] outline-none focus-visible:outline-none" value={compose.bcc} disabled={sending} onChange={(event) => setCompose({ ...compose, bcc: event.target.value })} /></label></> : null}
            <label className="flex min-h-[43px] items-center gap-[13px] border-b border-[#edf0f1] focus-within:border-[#8aabd7]"><span className="w-[52px] shrink-0 text-xs text-[#7c868b]">Subject</span><input className="h-[38px] min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--ink)] outline-none placeholder:text-[#a2aaae] focus-visible:outline-none" value={compose.subject} disabled={compose.mode === "reply" || sending} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} placeholder="Subject" /></label>
            <label className="block min-h-60"><span className="sr-only">Message</span><textarea className="min-h-[260px] w-full resize-y border-0 bg-transparent py-[19px] text-[13px] leading-[1.7] text-[var(--ink)] outline-none placeholder:text-[#a2aaae] focus-visible:outline-none" value={compose.body} disabled={sending || Boolean(sendState?.delivered) || Boolean(sendState?.sendError)} onChange={(event) => setCompose({ ...compose, body: event.target.value })} placeholder="Write your message…" /></label>
            <div className="flex flex-wrap items-center gap-3"><label className="inline-flex min-h-8 cursor-pointer items-center gap-[7px] rounded-md border border-[#dce2e5] px-[9px] text-[11px] font-medium text-[#516372] hover:bg-[#f7f9fa] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--blue)]"><Paperclip size={15} /> Attach files<input type="file" multiple className="sr-only" disabled={sending || Boolean(sendState?.delivered)} onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>{files.length ? <span className="break-words text-[11px] text-[#858f94]">{files.map((file) => file.name).join(", ")}</span> : null}</div>
            {sendState?.delivered && !sendState.savedInGmail ? <div className="mt-4 rounded-md border border-[#ebdbbc] bg-[#fff9ed] p-[13px] text-xs leading-normal text-[#785627]"><strong>Email delivered, Gmail copy missing</strong><p className="mb-[10px] mt-[5px]">{sendState.saveError}</p><button className="inline-flex min-h-8 items-center justify-center gap-[7px] rounded-md border border-[#d9dfe2] bg-white px-3 text-[11px] font-semibold text-[#485b6b] hover:border-[#c8d1d6] hover:bg-[#f6f8f9]" onClick={() => void retrySentCopy()}>Retry saving sent copy</button></div> : null}
            {sendState?.sendError ? <div className="mt-4 rounded-md border border-[#ebdbbc] bg-[#fff9ed] p-[13px] text-xs leading-normal text-[#785627]">Brevo did not confirm acceptance. Check its logs before starting a new send; this composer will not resend automatically.</div> : null}
          </div>
          <div className="flex min-h-[67px] items-center justify-between gap-[10px] border-t border-[var(--line)] px-[21px] max-[520px]:px-4"><span className="text-[10px] text-[#969fa3] max-[520px]:max-w-[155px] max-[520px]:leading-[1.3]">Plain text · up to 8 MB attachments</span><button className="inline-flex min-h-[35px] items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#243b5c] bg-[#243b5c] px-[14px] text-[11px] font-semibold text-white hover:enabled:bg-[#304f79]" disabled={sending || Boolean(sendState?.delivered) || Boolean(sendState?.sendError)} onClick={() => void sendMessage()}>{sending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{sending ? "Sending…" : "Send message"}</button></div>
        </div>
      </div> : null}
    </main>
  );
}
