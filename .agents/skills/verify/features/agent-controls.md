# Agent controls and status

The chat shows the agent's footer under the composer. The mode line becomes a pill that the user can click (or press Shift+Tab) to cycle the mode. Other footer lines show as segments. Esc or the stop button interrupts a working agent. When the agent asks a question, a panel shows the agent screen and answer keys.

## Sub-features

- `ctl-mode` shows the mode pill (`#mode.on`, label in `.ml`), and click or Shift+Tab sends `shift+tab`.
- `ctl-status` shows the other footer lines as `#status .seg`.
- `ctl-dot` shows the agent status in `#hchip` and `#hdot`.
- `ctl-stop` shows `#stop` and `#working` while the agent works. A click or Esc sends `esc`.
- `ctl-blocked` shows `#blocked.on` with the screen and answer keys (`[data-k]`) while the agent is blocked.

## How to get to it (user POV)

- Look under the composer for the mode pill and the status segments.
- Click the pill, or press Shift+Tab in the chat.
- Press Esc, or click the square stop button, while the agent works.

## Driving it with page.ts

Preconditions:

- Baseline state. The fixture is at mode 0, so there is no mode line and `#mode` is not `.on`.

- **Status segment.** Wait for `#status .seg` with `fixture-agent · verify`.
- **Cycle with Shift+Tab.** At mode 0 the pill is hidden, so use the key: `page.keyboard.press("Shift+Tab")`. Within 2 s, `j.agentScreen()` shows `mode: 1`, `#mode` has class `on`, and `#mode .ml` is `Accept edits`.
- **Cycle with the pill.** Click `#mode`. The agent shows `mode: 2`, and `.ml` is `Plan mode`.
- **Status chip.** `#hchip` has the text `idle`.
- **Stop and blocked.** The fixture has no `working` or `blocked` state. Report `ctl-stop` and `ctl-blocked` as not verified, or extend the fixture first.
- **Proof.** Take a screenshot at each mode, and save the agent screen text.

## Gotchas

- The pill shows only when a footer line matches `mode on|accept edits|bypass permissions|plan mode|manual mode`. At mode 0 it is hidden, so it cannot be clicked.
- The footer refreshes about once a second. Wait for it with `until`. Do not use one fixed sleep.
- Shift+Tab and Esc are document-level key bindings in `index.html`. They work with focus anywhere on the page, including `#input`.
