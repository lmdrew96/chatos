# Cha(t)os Onboarding Walkthrough — Feature Spec

## Overview

A two-part onboarding system with **Claudiu** as the guide character. Claudiu is Nae's personal Claude collaborator — friendly, energetic, a little chaotic, genuinely helpful. Powered by Claude Sonnet under the hood.

Landing page teaser introduces the concept and Claudiu. In-app wizard walks new users through full setup with a Claudiu chatbot available as a help layer throughout.

---

## Part 1: Landing Page Teaser

**Location:** Embedded section on chatos.adhdesigns.dev (pre-login)

### Content

- **"What is BYOK?" explainer** — 2-3 sentences, plain language. Something like: "Cha(t)os doesn't store your AI. You bring your own Claude API key, which means your conversations stay yours and you control your usage."
- **Visual preview** — Screenshot or short animation showing a Cha(t)os room in action (multiple users + Claude instances chatting)
- **Claudiu intro** — Chat bubble with personality: *"Hey! I'm Claudiu — Nae's personal Claude collaborator! I'll walk you through everything. Four steps, no jargon, let's go."*
- **CTA button** → Sign up / Log in to start setup

---

## Part 2: In-App Guided Onboarding

**Trigger:** First login when no API key is stored yet

**Format:** Step-by-step wizard overlay with progress indicator (e.g., Step 2 of 6)

**Skip option:** "Skip walkthrough" link for returning users or power users. Can be re-triggered from Settings.

### Step 1: Welcome

Claudiu introduces the onboarding flow.

> "Hey! I'm Claudiu — Nae's personal Claude collaborator, and now yours too! We're going to get you set up in about five minutes. You'll need an Anthropic API key (I'll show you where), and then we'll get your profile and first room rolling. Ready?"

- [Let's do it] button → proceeds
- [Skip — I know what I'm doing] link → skips to API key input

### Step 2: Get Your API Key

**Purpose:** Explain what an API key is and guide the user to get one.

**Content:**
- One-sentence explainer: "An API key is like a password that lets Cha(t)os talk to Claude on your behalf. You'll get one from Anthropic (the company that makes Claude)."
- Direct link: [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) — opens in new tab
- Screenshot showing exactly where to click "Create Key"
- Note about billing: "Anthropic charges based on usage — most casual users spend less than $5/month. You'll need to add a payment method on their platform first."

**Claudiu tip:**
> "Your key starts with `sk-ant-`. If it doesn't look like that, grab a different one. I'll wait!"

### Step 3: Paste Your Key

**Purpose:** Securely store the user's API key.

**Content:**
- Input field with paste support
- Client-side format validation (must start with `sk-ant-`)
- On success: Claudiu celebration — *"Boom! You're in. That key is stored securely — I'll never show it in plain text again."*
- On failure: Claudiu troubleshoots — *"Hmm, that doesn't look right. Make sure you copied the whole thing — they're long! Check that it starts with `sk-ant-`."*
- Link to Anthropic billing page if key is valid but account has no credits

### Step 4: Set Up Your Personal Context

**Purpose:** Connect the user to the Personal Context MCP so their Claude instances know who they are across rooms.

**MCP endpoint:** personal-context-mcp.vercel.app

**Content:**
- Explainer: *"This is how your Claude remembers you across rooms and conversations. The more you share, the less you repeat yourself. Totally optional — fill in as much or as little as you want."*
- Guided form fields mapping to the MCP structure:
  - **Identity** (name, pronouns, communication style) — required: name; rest optional
  - **Preferences** — freeform tags or short phrases for how they want Claude to communicate (e.g., "keep it short," "explain technical terms," "use emojis")
  - **Projects** — optional, can add later. Brief explanation: "Working on something? Add it here and your Claude will have context when you mention it."
  - **Relationships** — optional, can add later. Brief explanation: "If you're chatting in rooms with people Claude should know about, add them here."
- Save button → writes to MCP
- Claudiu tip:
  > "Pro tip: communication style is the biggest unlock. Tell me 'be blunt' or 'explain like I'm five' and your Claude will actually listen."

**Skip option:** "I'll set this up later" — link to Personal Context settings page

### Step 5: Create or Join a Room

**Purpose:** Get the user into their first room.

**Content:**
- Two paths:
  - **Create a room** — name it, get a shareable invite code
  - **Join a room** — paste an invite code from a friend
- Brief explanation of how rooms work: "Each room is a shared chat space. Everyone brings their own Claude, and you can @mention specific models or other users."

**Claudiu tip:**
> "Quick cheat sheet: @mention a person to ping them. @mention a Claude model to talk to it directly. @everyone if you want to cause maximum chaos. My kind of feature."

### Step 6: Send Your First Message

**Purpose:** Guided first interaction to confirm everything works.

**Content:**
- Prompt the user to type something — Claudiu suggests: *"Try saying 'hey Claude, what can you do in Cha(t)os?' and watch the magic happen."*
- On successful Claude response: wizard completes with Claudiu sign-off
  > "You're all set! I'll be around if you need me — hit the help button anytime. Now go cause some chaos. 🔥"
- Confetti or equivalent celebration animation

---

## Claudiu Chatbot (Help Layer)

### Location
Floating help button (chat bubble icon) available throughout the entire wizard. Persists after onboarding as a general help resource, accessible from any screen.

### Model
Claude Sonnet (via Anthropic API)

### System Prompt — Personality & Scope

```
You are Claudiu, the onboarding guide and help assistant for Cha(t)os — a multi-user group chat app built by Nae (ADHDesigns). 

Personality: You're energetic, genuinely helpful, and a little chaotic. You speak in short, punchy sentences. You're encouraging without being patronizing. You celebrate wins. You use emojis naturally but not excessively. You occasionally drop a joke or a haiku when the moment calls for it. You feel like a friend who happens to know everything about Cha(t)os.

Voice examples:
- "Oh that's an easy fix — here's what happened."
- "Nailed it! Room's live. Go invite someone!"  
- "Okay so API keys can be confusing — think of it like a password that lets me talk to you. One password, all your rooms."

Scoped knowledge — you can help with:
- Cha(t)os features: rooms, @mentions, file uploads, Claude instances
- API key setup and troubleshooting (billing, format, rate limits)
- Personal Context MCP setup (identity, preferences, projects, relationships)
- Room management (create, join, invite codes)
- General "how does this work" questions about the app

Out of scope — if asked about anything else:
- Politely redirect: "That's a great question but a little outside my lane! Try asking in your room — your Claude there can handle it."
```

### Behavior
- Opens as a small chat panel (not full-screen)
- Maintains conversation history within the session
- Clears on page refresh (no persistence needed)
- Input field with send button, simple chat UI
- Claudiu's messages styled differently from user messages (branded color/avatar)

---

## Technical Notes

- Wizard state persists via local storage or Convex — if user leaves mid-setup, resume at last completed step
- "Skip walkthrough" available at every step
- Wizard can be re-triggered from Settings → "Restart onboarding"
- Claudiu chatbot uses Sonnet; cost per onboarding conversation is negligible (one-time per user)
- API key validation is client-side format check only (starts with `sk-ant-`); actual validity confirmed on first Claude API call in Step 6
- Personal Context MCP writes go to personal-context-mcp.vercel.app
- Landing page teaser is static content (no API calls until login)

---

## Future Considerations

- Claudiu could offer contextual tips beyond onboarding (e.g., first time uploading a file, first @everyone mention)
- Onboarding analytics: track where users drop off in the wizard
- Invite flow: let users send a pre-filled invite link that skips the "Join a Room" step
