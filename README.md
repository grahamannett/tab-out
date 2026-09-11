# Tab Out

**Keep tabs on your tabs.**

Tab Out is a Chrome extension that replaces your new tab page with a dashboard of everything you have open. Tabs are grouped by domain, with homepages (Gmail, X, LinkedIn, etc.) pulled into their own group. Close tabs with a satisfying swoosh + confetti.

No server. No account. Optional tab chat uses Chrome's built-in on-device AI.

---

## Install with a coding agent

Send your coding agent (Claude Code, Codex, etc.) this repo and say **"install this"**:

```
https://github.com/zarazhangrui/tab-out
```

The agent will walk you through it. Takes about 1 minute.

---

## Features

- **See all your tabs at a glance** on a clean grid, grouped by domain
- **Homepages group** pulls Gmail inbox, X home, YouTube, LinkedIn, GitHub homepages into one card
- **Close tabs with style** with swoosh sound + confetti burst
- **Duplicate detection** flags when you have the same page open twice, with one-click cleanup
- **Click any tab to jump to it** across windows, no new tab opened
- **Ask your tabs** count, find, switch to, and preview closing tabs through local AI
- **Save for later** bookmark tabs to a checklist before closing them
- **Localhost grouping** shows port numbers next to each tab so you can tell your vibe coding projects apart
- **Expandable groups** show the first 8 tabs with a clickable "+N more"
- **Local storage and AI** saved tabs stay in Chrome; chat inference runs on-device
- **Pure Chrome extension** no server, no Node.js, no npm; the dashboard works without AI

---

## Manual Setup

**1. Clone the repo**

```bash
git clone https://github.com/zarazhangrui/tab-out.git
```

**2. Load the Chrome extension**

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Navigate to the `extension/` folder inside the cloned repo and select it

**3. Open a new tab**

You'll see Tab Out.

---

## Ask your tabs — new in 1.1.0

Click **Ask your tabs** beside the greeting. The panel stays collapsed until you open it.
This is a tab assistant, not a general-purpose chatbot. Try:

- **What questions do you work with?** — shows capabilities and examples.
- **What model are you?** — explains Chrome's on-device Gemini Nano integration.
- **How many tabs are related to Hacker News?** — matches titles and URLs.
- **Find GitHub tabs** or **Switch to my GitHub tab** — lists exact tabs to select.
- **Close extras** — previews extra Tab Out / New Tab pages, keeping this dashboard.
- **Close duplicate Hacker News tabs** — previews surplus exact-URL copies.

Counts cover all windows, including duplicate tabs. Total counts include browser pages
and Tab Out itself. "On Hacker News" matches the site; "related to Hacker News" also
matches words in titles and URLs. Chat cannot read or summarize page contents.

Every **chat** closure requires reviewing the listed tabs and clicking **Close N tabs**.
Typing "yes" does not confirm. Previews show pinned tabs, kept copies, and exclusions;
targets are rechecked before closing. A new request, Cancel, or collapsing the panel
cancels the preview. The existing dashboard buttons retain their direct behavior.

**Local AI setup:** use a Chrome profile that supports the
[built-in Prompt API](https://developer.chrome.com/docs/ai/get-started).
If prompted, click **Set up local AI** to let Chrome download its model. Chat sending
stays disabled until the model is ready. Unsupported profiles keep the normal dashboard;
there is no cloud fallback. The current chat interface is English-language.

**Keyboard:** Enter sends, Shift+Enter adds a line, and Escape collapses the panel.
Stop cancels pending AI work, not a tab-closing operation already confirmed.
Clear chat removes the conversation. Chat history is not restored after a reload.

### Updating an existing installation

Reload Tab Out in `chrome://extensions`, then open a new tab. Keep the unpacked extension
loaded from the permanent checkout's `extension/` folder, not a temporary worktree:
Chrome needs that folder to remain available.

---

## How it works

```
You open a new tab
  -> Tab Out shows your open tabs grouped by domain
  -> Homepages (Gmail, X, etc.) get their own group at the top
  -> Click any tab title to jump to it
  -> Close groups you're done with (swoosh + confetti)
  -> Save tabs for later before closing them
```

The dashboard and chat run inside Chrome. Saved tabs are stored in `chrome.storage.local`;
chat messages and pending confirmations stay in the current page's memory.
The model receives your request and minimal intent context, not an inventory of your
tab titles or URLs. Application code performs matching, counting, and tab actions.

There is no external AI endpoint. Chrome handles its model download separately.
The existing dashboard still fetches Google Fonts and favicons; favicon requests include
site hostnames. "On-device AI" does not mean the entire dashboard makes no network requests.

---

## Tech stack

| What | How |
|------|-----|
| Extension | Chrome Manifest V3 |
| Storage | chrome.storage.local |
| Tab chat | Chrome Prompt API / Gemini Nano; deterministic tab actions |
| Sound | Web Audio API (synthesized, no files) |
| Animations | CSS transitions + JS confetti particles |

---

## License

MIT

---

Built by [Zara](https://x.com/zarazhangrui)
