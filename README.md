# Greyvetro TTS

A text-to-speech desktop app built on ElevenLabs. **.NET 10 backend + Flutter
desktop frontend** (macOS + Windows). Built for personal/company use with
brand-aligned styling.

The ElevenLabs API key lives **only** on the backend — the Flutter app never
sees it and talks to the backend over `http://localhost:5050`.

> For architecture, conventions, and roadmap, see [`CLAUDE.md`](./CLAUDE.md).

---

## Full-stack quickstart

The app is two processes: a **backend** API and a **frontend** desktop app.
Run each in its own terminal, backend first.

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| .NET SDK | **10.0+** | `dotnet --version` |
| Flutter | **3.44+** (Dart SDK ≥ 3.12) | `flutter --version` |
| ElevenLabs API key | — | `sk_...` — [free tier](https://elevenlabs.io) works for premade voices |
| Platform toolchain | Xcode (macOS) / Visual Studio with "Desktop development with C++" (Windows) | required to build the Flutter desktop shell |

Run `flutter doctor` once to confirm your desktop toolchain is set up.

### 1. Configure the backend key (one time)

The ElevenLabs key is read from an **environment variable**, never committed to
the repo. .NET maps the double-underscore env var `ElevenLabs__ApiKey` onto the
config key `ElevenLabs:ApiKey`.

**macOS / Linux** — add it to your shell profile (`~/.zshrc`):

```bash
export ElevenLabs__ApiKey="sk_..."
```

Then reload the shell (`source ~/.zshrc` or open a new terminal). Verify with
`echo $ElevenLabs__ApiKey`.

**Windows (PowerShell)**:

```powershell
setx ElevenLabs__ApiKey "sk_..."
```

Then open a new terminal so the variable is picked up.

> The git-ignored `backend/Greyvetro.API/appsettings.json` holds only non-secret
> config (`Urls`, logging). You *can* put the key there under
> `"ElevenLabs": { "ApiKey": "sk_..." }` instead of the env var — .NET reads
> either — but keep the key out of any committed file.

### 2. Terminal 1 — backend

```bash
cd backend
dotnet run --project Greyvetro.API      # serves http://localhost:5050
```

Leave it running. Sanity check from another shell: `curl http://localhost:5050/voices`.

### 3. Terminal 2 — frontend

**macOS:**

```bash
cd frontend
flutter pub get
flutter run -d macos
```

**Windows:**

```bash
cd frontend
flutter pub get
flutter run -d windows
```

The frontend expects the backend on `http://localhost:5050` (hardcoded in
`frontend/lib/core/api_client.dart`). If you change the backend port, update it
in `appsettings.json`, `launchSettings.json`, and `api_client.dart` together.

---

## Platform support

| Feature | macOS | Windows |
|---------|:-----:|:-------:|
| Generate speech / clone voices / gallery | ✅ | ✅ |
| In-app audio playback + seek/scrubber | ✅ | ✅ |

In-app playback uses the cross-platform [`audioplayers`](https://pub.dev/packages/audioplayers)
package, so it works on both macOS and Windows. Playing an item (in the Gallery
or the composer preview) shows an interactive seek bar — drag or click anywhere
on it to jump to that point.

---

## Project layout

```
greyvetro-tts/
├── backend/        # .NET 10, Clean Architecture (Domain/Application/Infrastructure/API)
├── frontend/       # Flutter desktop (macOS + Windows)
└── CLAUDE.md       # architecture, conventions, roadmap
```

## Troubleshooting

- **Port 5050 already in use** — something else is on the port. Note macOS
  AirPlay occupies `:5000`, so don't switch to that.
- **Frontend can't reach the API / voices list is empty** — make sure the
  backend terminal is running and reachable (`curl http://localhost:5050/voices`).
- **Voice cloning fails** — Instant Voice Cloning requires a paid ElevenLabs
  plan; it will error on a free account.
