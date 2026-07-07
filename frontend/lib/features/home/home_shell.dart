import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/audio_player.dart';
import '../gallery/gallery_item.dart';
import '../gallery/gallery_repository.dart';
import '../gallery/gallery_screen.dart';
import '../presets/preset.dart';
import '../presets/preset_repository.dart';
import '../presets/presets_screen.dart';
import '../tts/tts_screen.dart';
import '../usage/usage_badge.dart';
import '../voices/voice_model.dart';
import 'app_sidebar.dart';

/// Top-level navigation: Create (composer) and Gallery, sharing one
/// ApiClient, AudioPlayer and GalleryRepository.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  final _apiClient = ApiClient();
  final _player = AudioPlayer();
  final _gallery = GalleryRepository();
  final _presets = PresetRepository();

  final _composerKey = GlobalKey<TtsScreenState>();
  final _galleryKey = GlobalKey<GalleryScreenState>();
  final _presetsKey = GlobalKey<PresetsScreenState>();
  final _usageKey = GlobalKey<UsageBadgeState>();

  int _index = 0;

  /// Below this width the sidebar collapses to a 64px icon rail.
  static const _compactBreakpoint = 1000.0;

  /// Keep the composer's preset menu and the Presets tab in sync after any
  /// preset is created, edited, or deleted anywhere in the app.
  void _refreshPresetsEverywhere() {
    _presetsKey.currentState?.refresh();
    _composerKey.currentState?.reloadPresets();
  }

  /// Apply a preset's voice + settings to the composer and switch to Create.
  void _applyPreset(Preset p) {
    _composerKey.currentState?.applySettings(
      voiceId: p.voiceId,
      voiceName: p.voiceName,
      stability: p.stability,
      similarity: p.similarityBoost,
      style: p.style,
      speakerBoost: p.useSpeakerBoost,
    );
    setState(() => _index = 0);
  }

  @override
  void dispose() {
    _apiClient.dispose();
    _player.dispose();
    super.dispose();
  }

  void _editFromGallery(GalleryItem item) {
    // Reconstruct a minimal voice for the composer (id drives generation).
    final voice = VoiceModel(
      id: item.voiceId,
      name: item.voiceName,
      description: '',
      isCustom: false,
    );
    _composerKey.currentState?.applyPrefill(
      item.text,
      voice,
      stability: item.stability,
      similarity: item.similarityBoost,
      style: item.style,
      speakerBoost: item.useSpeakerBoost,
    );
    setState(() => _index = 0);
  }

  /// Copy a generated item's voice + settings into the composer, keeping
  /// whatever text is currently there.
  void _useSettingsFromGallery(GalleryItem item) {
    _composerKey.currentState?.applySettings(
      voiceId: item.voiceId,
      voiceName: item.voiceName,
      stability: item.stability,
      similarity: item.similarityBoost,
      style: item.style,
      speakerBoost: item.useSpeakerBoost,
    );
    setState(() => _index = 0);
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      TtsScreen(
        key: _composerKey,
        apiClient: _apiClient,
        player: _player,
        gallery: _gallery,
        presets: _presets,
        onSavedToGallery: () => _galleryKey.currentState?.refresh(),
        onGenerated: () => _usageKey.currentState?.refresh(),
        onPresetsChanged: _refreshPresetsEverywhere,
      ),
      GalleryScreen(
        key: _galleryKey,
        repository: _gallery,
        presets: _presets,
        player: _player,
        onEdit: _editFromGallery,
        onUseSettings: _useSettingsFromGallery,
        onPresetsChanged: _refreshPresetsEverywhere,
      ),
      PresetsScreen(
        key: _presetsKey,
        repository: _presets,
        apiClient: _apiClient,
        player: _player,
        onApply: _applyPreset,
        onPresetsChanged: _refreshPresetsEverywhere,
      ),
    ];

    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < _compactBreakpoint;
          return Row(
            children: [
              AppSidebar(
                selectedIndex: _index,
                onSelect: _select,
                compact: compact,
                usageCard: UsageBadge(
                  key: _usageKey,
                  apiClient: _apiClient,
                  variant: UsageBadgeVariant.sidebar,
                ),
                destinations: const [
                  SidebarDestination(
                    icon: Icons.edit_outlined,
                    label: 'Create',
                  ),
                  SidebarDestination(
                    icon: Icons.grid_view_rounded,
                    label: 'Gallery',
                  ),
                  SidebarDestination(
                    icon: Icons.bookmark_outline_rounded,
                    label: 'Presets',
                  ),
                ],
              ),
              Expanded(
                child: IndexedStack(index: _index, children: pages),
              ),
            ],
          );
        },
      ),
    );
  }

  void _select(int i) {
    setState(() => _index = i);
    if (i == 1) _galleryKey.currentState?.refresh();
    if (i == 2) _presetsKey.currentState?.refresh();
  }
}
