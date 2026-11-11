// pixel app: the chat page across the whole pane, with no browser chrome.
const { createRoot } = require("@zenbu-labs/pixel");

const root = createRoot({ name: "herdr-chat-view" });
root.loadURL(process.env.HERDR_CHAT_URL);
