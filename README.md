# Xander Mail

I built Xander Mail because legitimate messages sent to my contact address sometimes ended up in Gmail's Spam folder and were easy to miss. Gmail is also [ending "Send as" for third-party addresses in January 2027](https://support.google.com/mail/answer/17101213). I wanted one private inbox for all of my contact mail and a way to keep replying from that address.

Xander Mail is a private webmail client for a single email address you configure. It reads conversations from Gmail and sends new messages and replies through Brevo. The interface is built for one person and runs on your own server.

## Overview

Your chosen address must deliver mail to the Gmail account you connect, either directly or through a forwarding service such as Cloudflare Email Routing. Xander Mail reads that mailbox through the Gmail API; it does not store a second copy of incoming mail. The Inbox combines messages in Gmail's Inbox and Spam that match the configured address, while Sent shows outgoing conversations.

```text
Incoming: sender → your address → Gmail (directly or via forwarding)
Reading:  browser → Xander Mail → Gmail API
Sending:  browser → Xander Mail → Brevo SMTP → recipient
                                  ↘ Gmail API → sent copy
```

Gmail remains the source of truth for messages and read/unread state. Changes made in Gmail appear in the app after a refresh; the app does not maintain a live connection to Gmail.

## Features

- Inbox and Sent views limited to conversations involving the configured address
- Gmail Spam messages for that address shown in the Inbox with a Spam label
- Search, conversation reading, attachment downloads, and read/unread controls
- New messages, replies, Cc, Bcc, and attachments up to 8 MB total
- Replies with standard `Message-ID`, `In-Reply-To`, and `References` headers for threading
- Brevo SMTP delivery with a sent copy inserted into Gmail
- A separate recovery action if delivery succeeds but saving the Gmail copy fails
- Responsive desktop and mobile interface

## Tech stack

| Area | Technology |
| --- | --- |
| App and API | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 and CSS |
| Mailbox | Gmail API with Google OAuth |
| Delivery | Brevo SMTP through Nodemailer |
| Validation and rendering | Zod and sanitize-html |

## Project structure

```text
app/             Next.js pages, API routes, and app icon
components/      Mail interface
lib/gmail/       Gmail queries, messages, and threads
lib/google/      OAuth token refresh
lib/email/       MIME building, threading, and Brevo delivery
scripts/         Google OAuth setup helper
.env.example     Environment variable template
```

## Prerequisites

- Node.js 20.9 or newer and npm
- A Gmail account receiving mail for the address you want to use, directly or through forwarding
- A Google Cloud project with the Gmail API enabled and an OAuth client
- A Brevo account with that address or its domain verified for sending
- A Brevo **SMTP key** and SMTP login; a Brevo HTTP API key will not work

## Setup

### 1. Install dependencies

From the project root:

```bash
npm ci
```

Copy the example environment file to `.env.local`:

```bash
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local`. The environment file is ignored by Git; keep real credentials out of commits and screenshots.

### 2. Configure Google

In Google Cloud, enable the Gmail API, configure the OAuth consent screen, and create an OAuth client. The client must allow the redirect URI in `GOOGLE_REDIRECT_URI` exactly. If the consent screen is in Testing mode, add the Gmail account as a test user.

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, then obtain a refresh token:

```bash
node --env-file=.env.local scripts/google-oauth-setup.mjs
```

Open the URL printed by the script and authorize the Gmail account. Google redirects to the configured callback URL; that page can fail to load when no local server is listening. Copy the `code` value from the browser URL into the script, then save the returned token as `GOOGLE_REFRESH_TOKEN`.

The app requests the `gmail.modify` scope so it can read messages, update read/unread state, and save sent copies.

### 3. Configure Brevo

In Brevo, verify your sender address or domain and obtain the SMTP login and SMTP key from its SMTP settings. Set `BREVO_SMTP_LOGIN` and `BREVO_SMTP_KEY` in `.env.local`. Set `MAIL_FROM_ADDRESS=you@example.com`, replacing the example with the address that reaches your Gmail account. The app uses that address to scope conversations, display the mailbox, and send mail.

For local development, set `APP_URL=http://localhost:3000`. The app checks the request origin before writes, so this value must match the URL used in the browser.

## Running the application

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The health endpoint is `/api/health`. To test the full mail flow, send a message from another address you control to your configured address, reply from Xander Mail, and check that the reply arrives and appears in Sent.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `APP_URL` | Yes | Origin allowed to make write requests; use the public HTTPS URL in production |
| `MAIL_FROM_ADDRESS` | Yes | Your email address; used to scope Gmail conversations and send mail |
| `MAIL_FROM_NAME` | No | Display name on outgoing mail; defaults to `Mail` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Yes | Refresh token for the Gmail account |
| `GOOGLE_REDIRECT_URI` | For OAuth setup | Redirect URI used by the setup script; must match the OAuth client |
| `BREVO_SMTP_LOGIN` | For sending | Brevo SMTP login |
| `BREVO_SMTP_KEY` | For sending | Brevo SMTP key, not an HTTP API key |

Keep all credentials server-side. Do not prefix them with `NEXT_PUBLIC_`.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server (normally port 3000) |
| `npm run build` | Type-check and build the production app |
| `npm start` | Start the production build on port 7777 |
| `npm run lint` | Run ESLint |
| `npm run oauth:setup` | Run the OAuth helper when Google variables are already exported in the shell |

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Check whether the app is responding |
| `GET` | `/api/mail?folder=inbox` | List scoped Inbox conversations, including Gmail Spam |
| `GET` | `/api/mail?folder=sent` | List scoped Sent conversations |
| `GET` | `/api/threads/{threadId}` | Read a conversation |
| `POST` | `/api/threads/{threadId}/actions` | Mark a conversation read or unread |
| `GET` | `/api/messages/{messageId}/attachments/{attachmentId}` | Download an attachment |
| `POST` | `/api/send` | Send through Brevo and save the Gmail copy |
| `POST` | `/api/send/sent-copy` | Retry saving a delivered message to Gmail |

## Production notes

Build the app with `npm run build`, then run `npm start`. The current start script uses port 7777. Place it behind an HTTPS reverse proxy, set `APP_URL` to the exact public origin, and run the process with `NODE_ENV=production`. If the reverse proxy is on the same machine, bind the app to loopback:

```bash
npm start -- --hostname 127.0.0.1
```

This app has **no built-in login**. Restrict access at the reverse proxy with your IP allowlist or another authentication layer before exposing it. Anyone who can reach the app can read and send mail. The server also needs outbound access to Google and to `smtp-relay.brevo.com:587`.

## Mail and privacy notes

- Gmail Spam is visible in the app's Inbox, but reading it does not change Gmail's Spam label. Mail rejected before reaching Gmail cannot appear here.
- Sending uses Brevo SMTP. Brevo accepting a message confirms submission to its relay, not final delivery to the recipient.
- If Brevo accepts a message but Gmail cannot save the sent copy, use **Retry saving sent copy** in the composer. Do not press Send again for that message.
- The sent copy retry is held in memory for 15 minutes in the running process. A restart clears it; check Gmail and the server logs before any manual recovery.
- The app stores no mailbox database. Message content is requested from Gmail when you open or refresh the interface.
