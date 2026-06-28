import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/audio_player.dart';
import '../../core/theme.dart';
import '../gallery/gallery_item.dart';
import '../gallery/gallery_repository.dart';
import '../gallery/gallery_screen.dart';
import '../tts/tts_screen.dart';
import '../voices/voice_model.dart';

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

  final _composerKey = GlobalKey<TtsScreenState>();
  final _galleryKey = GlobalKey<GalleryScreenState>();

  int _index = 0;

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
        onSavedToGallery: () => _galleryKey.currentState?.refresh(),
      ),
      GalleryScreen(
        key: _galleryKey,
        repository: _gallery,
        player: _player,
        onEdit: _editFromGallery,
      ),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) {
          setState(() => _index = i);
          if (i == 1) _galleryKey.currentState?.refresh();
        },
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.babyBlue.withValues(alpha: 0.5),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.graphic_eq_rounded),
            label: 'Create',
          ),
          NavigationDestination(
            icon: Icon(Icons.library_music_rounded),
            label: 'Gallery',
          ),
        ],
      ),
    );
  }
}
