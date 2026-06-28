# Greyvetro TTS

A text-to-speech desktop app built on ElevenLabs. .NET backend + Flutter frontend.
Built for personal/company use with brand-aligned styling.

---

## Architecture

```
greyvetro-tts/
├── backend/                       # .NET 10 — Clean Architecture
│   ├── Greyvetro.Domain/          # Entities + interfaces (no dependencies)
│   ├── Greyvetro.Application/      # Feature handlers (CQRS-lite: Command/Query + Handler)
│   ├── Greyvetro.Infrastructure/  # ElevenLabs client impl, DI wiring
│   └── Greyvetro.API/             # Minimal API endpoints (Program.cs)
└── frontend/                      # Flutter 3.44 (desktop: macOS + Windows)
    └── lib/
        ├── core/                  # api_client.dart — HTTP layer
        ├── features/tts/          # generation screen
        └── features/voices/       # voice model + picker
```

### Backend conventions
- **Dependency rule**: Domain ← Application ← Infrastructure ← API. Never invert.
- Each feature is a `record` Command/Query + a `Handler` class with `HandleAsync`. Register handlers in `Infrastructure/DependencyInjection/ServiceCollectionExtensions.cs`.
- The ElevenLabs SDK type `Voice` collides with our domain `Voice`; in `ElevenLabsService` we fully-qualify `Domain.Entities.Voice`. Keep that pattern.
- Endpoints live in `Program.cs` as minimal APIs. Keep them thin — delegate to handlers.
- Target framework: `net10.0`. C# implicit usings + nullable enabled.

### Frontend conventions
- Feature-first folders under `lib/features/`. Shared infra under `lib/core/`.
- Currently uses plain `setState` (no state-management package). Keep it simple unless complexity demands `provider`/`riverpod` — decide before adding.
- Audio playback currently shells out to macOS `afplay`. This is **macOS-only** — see Known Issues.

---

## Running locally

**Backend** (from `backend/`):
```bash
dotnet run --project Greyvetro.API     # serves http://localhost:5050
```
Requires `Greyvetro.API/appsettings.json` (git-ignored) with:
```json
{ "ElevenLabs": { "ApiKey": "sk_..." } }
```

**Frontend** (from `frontend/`):
```bash
flutter run -d macos
```

The API key lives **only** on the backend. The Flutter app never sees it. Keep it that way.

---

## ElevenLabs notes (important)

- **Free tier** = ~10,000 credits/month, access to premade voices + the community Voice Library. `GetVoicesAsync` currently filters to `premade` and `cloned` categories.
- **Voice cloning (Instant Voice Cloning) requires a paid plan** (Starter+). This conflicts with a "free-only" goal — see Roadmap §2. The `/voices/clone` endpoint exists but will fail on a free account.
- **Usage/credits** come from the user subscription endpoint (`character_count` / `character_limit`). Not yet wired up — see Roadmap §3.
- Models: default `eleven_multilingual_v2`. `eleven_turbo_v2_5` / `eleven_flash_v2_5` cost fewer credits — consider exposing model choice.

---

## Brand & UI

Company palette — the UI should feel modern, soft, and on-brand:
- **Grey** — neutral base / surfaces / text
- **Baby blue** — primary accent
- **Baby pink** — secondary accent

Proposed tokens (tune during implementation):
| Token        | Hex       | Use                         |
|--------------|-----------|-----------------------------|
| Baby blue    | `#A8D8EA` | primary buttons, selection  |
| Baby pink    | `#FCD5D5` | secondary, highlights       |
| Soft grey    | `#F4F5F7` | background / surfaces        |
| Slate grey   | `#5B6470` | body text                    |
| Deep grey    | `#2E343D` | headings                     |

Aim for rounded corners, gentle shadows, generous spacing, and a clean sans-serif.

---

## Roadmap

1. ✅ **Free voices only** — `GetVoicesAsync` returns premade (free) + cloned; picker has search + gender filter (`voices_screen.dart`, `voice_model.dart` parses labels).
2. ✅ **Use my own voice** — `CreateVoiceScreen` (opened via "Create my voice" in the picker): record (package `record`) or upload (`file_picker`) samples → `POST /voices/clone` (multipart) → returned voice is selected and shows under "My Voices". Warns if `usage.canCloneVoices` is false. macOS mic + user-selected-file entitlements added; `NSMicrophoneUsageDescription` set. Requires a paid ElevenLabs plan to actually clone.
3. ✅ **Credit tracking** — backend `GET /usage` (subscription endpoint); `UsageBadge` in the composer header (remaining credits + bar, refreshes after each generation).
4. ✅ **Modern brand UI** — `core/theme.dart` palette (grey / baby blue / baby pink); all screens restyled.
5. ✅ **Local gallery** — `GalleryRepository` persists audio + metadata under app documents dir; `GalleryScreen` (Gallery tab) replays, shows text, edit & regenerate, export, delete. Shared `AudioPlayer` (`core/audio_player.dart`). Navigation via `HomeShell`.

### Candidate additions
- ✅ **Stability / similarity sliders** — "Voice settings" card in the composer; values flow into generation, are stored per gallery item, and restored on edit/regenerate. (Model selection still hardcoded to `eleven_multilingual_v2`.)
- **Voice preview** playback before selecting.
- **Favorites** for voices.
- **Quota-exceeded** friendly error handling.
- **Dark mode**.
- Cross-platform audio playback (replace `afplay`).

---

## Known issues / tech debt
- `AudioPlayer` (`core/audio_player.dart`) shells out to macOS `afplay` — **macOS-only**, blocks Windows. Swap for a Dart package (`just_audio` / `audioplayers`) when Windows is needed.
- CORS is wide open (`AllowAnyOrigin`) — fine for local dev, revisit if ever hosted.
- **Port = 5050** everywhere. Source of truth is `appsettings.json` `"Urls": "http://localhost:5050"` (used when the VS Code debugger runs the built DLL). `launchSettings.json` (used by `dotnet run`) and the Flutter `ApiClient._base` are aligned to match. Note macOS AirPlay occupies :5000, so don't use that. ~~`Console.WriteLine` logging~~ (fixed: `ILogger`).

---

## Workflow with Claude
- Build features **one at a time**; confirm scope before large changes.
- Keep the dependency rule and feature-folder conventions intact.
- Update this file's Roadmap as items ship.
