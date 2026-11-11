# Voice dictation

The microphone button in the composer dictates into the message box. A click starts the system tool (voxtype), a second click stops it, and the tool transcribes on the machine. The button is red while the tool records and shows a spinner while it transcribes. Then the text comes after the draft. Esc cancels a running dictation. `[voice] tool` in `config.toml` selects the tool or turns the button off.

## Sub-features

- `vo-idle` shows the button, enabled, with the tooltip `Dictate (voxtype)` when the tool is on `PATH`.
- `vo-record` starts the tool with `record start --file=<state-dir>/voice-<n>.txt` and keeps the focus in `#input`.
- `vo-transcribe` stops the tool with `record stop` and shows the spinner.
- `vo-text` adds the text after the draft, with one space, and deletes the text file.
- `vo-cancel` cancels with Esc (`record cancel`) and sends no key to the agent. Esc with no dictation still interrupts the agent.
- `vo-error` shows the tool's message in `#err` when a command fails.
- `vo-off` hides the button for `tool = "off"`, with no page reload.

## How to get to it (user POV)

- Click the microphone button left of the send button, speak, and click it again.

## Driving it with page.ts

Preconditions:

- Baseline state. `up.sh` copies `scripts/fake-voxtype.sh` to `<run-dir>/voxtype/voxtype` and starts the server with `HERDR_CHAT_VOICE_BIN` set to it, so a verify run never uses the real microphone. `run.env` has `FAKE_VOXTYPE_DIR`. In that directory, `calls.log` has one line per call, `text` sets the dictated text, and a `fail` file makes each `record` command fail with its content. The fake writes the result 2 s after `record stop`.

- **Journey.** `bun scripts/page.ts <run-dir> journeys/voice.ts`. It clicks `#mic`, presses Esc in `#input`, writes the fake's `fail` file and the config file, and removes them at the end.
- **Side effects.** `calls.log` has the tool calls in order. `/api/keys` gets no request while Esc cancels. The state directory has no `voice-*` file after the text comes.
- **Proof.** A screenshot for idle, recording, transcribing, the text in the box, cancelled, the error, and off.

## Gotchas

- Not covered: real speech to text. The fake writes a fixed text. To test the real tool, open a chat pane in the live session with voxtype's daemon on, click the button, speak, and click again.
- Not covered: the disabled button when no tool is on `PATH`. The fake is always on the path. `voice.test.ts` covers the reason text.
- `console.log` has one `400 (Bad Request)` line: the `/api/voice` answer in the error step. It is expected.
- The fake keeps its state in `<run-dir>/voxtype/state`. A journey that stops half way can leave it at `recording`. Run the journey again, or write `idle` to the file.
