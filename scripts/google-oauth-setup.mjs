import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3000/oauth/callback";
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this script.");
  process.exit(1);
}

const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
auth.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/gmail.modify",
  access_type: "offline",
  prompt: "consent",
}).toString();

console.log("Open this URL and authorize your Gmail account:\n");
console.log(auth.toString());
console.log("\nGoogle will redirect to the configured URI. The page may fail to load; copy the code query parameter from its URL.");
const rl = createInterface({ input: stdin, output: stdout });
const code = (await rl.question("Authorization code: ")).trim();
rl.close();
const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
    code, grant_type: "authorization_code",
  }),
});
if (!response.ok) {
  console.error("Google token exchange failed. Check the redirect URI and code.");
  process.exit(1);
}
const data = await response.json();
if (!data.refresh_token) {
  console.error("No refresh token returned. Revoke the app's existing grant and retry with prompt=consent.");
  process.exit(1);
}
console.log("\nSave this securely in your environment as GOOGLE_REFRESH_TOKEN:\n");
console.log(data.refresh_token);
