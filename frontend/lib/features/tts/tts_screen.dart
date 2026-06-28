import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/api_client.dart';
import '../../core/audio_player.dart';
import '../../core/theme.dart';
import '../gallery/gallery_repository.dart';
import '../usage/usage_badge.dart';
import '../voices/voice_model.dart';
import '../voices/voices_screen.dart';

class TtsScreen extends StatefulWidget {
  final ApiClient apiClient;
  final AudioPlayer player;
  final GalleryRepository gallery;

  /// Called after a generation is saved to the gallery, so the gallery tab
  /// can refresh.
  final VoidCallback onSavedToGallery;

  const TtsScreen({
    super.key,
    required this.apiClient,
    required this.player,
    required this.gallery,
    required this.onSavedToGallery,
  });

  @override
  State<TtsScreen> createState() => TtsScreenState();
}

class TtsScreenState extends State<TtsScreen> {
  final _textController = TextEditingController();
  final _usageKey = GlobalKey<UsageBadgeState>();
  VoiceModel? _selectedVoice;
  bool _loading = false;
  Uint8List? _audioBytes;
  String? _tempAudioPath;
  bool _saved = false;
  String? _error;

  double _stability = 0.5;
  double _similarity = 0.75;
  bool _showAdvanced = false;

  @override
  void initState() {
    super.initState();
    _textController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  /// Load a saved recording back into the composer (edit & regenerate flow).
  void applyPrefill(
    String text,
    VoiceModel voice, {
    double? stability,
    double? similarity,
  }) {
    setState(() {
      _textController.text = text;
      _selectedVoice = voice;
      if (stability != null) _stability = stability;
      if (similarity != null) _similarity = similarity;
      _audioBytes = null;
      _tempAudioPath = null;
      _saved = false;
      _error = null;
    });
  }

  Future<void> _generate() async {
    if (_selectedVoice == null || _textController.text.trim().isEmpty) return;
    await widget.player.stop();
    setState(() {
      _loading = true;
      _error = null;
      _audioBytes = null;
      _tempAudioPath = null;
      _saved = false;
    });
    try {
      final bytes = await widget.apiClient.generateSpeech(
        text: _textController.text.trim(),
        voiceId: _selectedVoice!.id,
        stability: _stability,
        similarityBoost: _similarity,
      );
      final tmp = await getTemporaryDirectory();
      if (!await tmp.exists()) await tmp.create(recursive: true);
      final file = File('${tmp.path}/grey_vetro_preview.mp3');
      await file.writeAsBytes(bytes);
      setState(() {
        _audioBytes = bytes;
        _tempAudioPath = file.path;
      });
      _usageKey.currentState?.refresh();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _togglePlayback() async {
    if (_tempAudioPath == null) return;
    await widget.player.toggle(_tempAudioPath!);
  }

  Future<void> _saveToGallery() async {
    if (_audioBytes == null || _selectedVoice == null) return;
    try {
      await widget.gallery.add(
        bytes: _audioBytes!,
        text: _textController.text.trim(),
        voiceId: _selectedVoice!.id,
        voiceName: _selectedVoice!.name,
        stability: _stability,
        similarityBoost: _similarity,
      );
      setState(() => _saved = true);
      widget.onSavedToGallery();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saved to your gallery')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Save failed: $e'),
            backgroundColor: AppColors.babyPinkDeep,
          ),
        );
      }
    }
  }

  void _openVoicePicker() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (_) => SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.outline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 20, 24, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Select a Voice',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.deep,
                  ),
                ),
              ),
            ),
            Expanded(
              child: VoicesScreen(
                apiClient: widget.apiClient,
                player: widget.player,
                selectedVoice: _selectedVoice,
                onVoiceSelected: (v) {
                  setState(() => _selectedVoice = v);
                  Navigator.pop(context);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final charCount = _textController.text.characters.length;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _header(),
                  const SizedBox(height: 28),
                  _textCard(charCount),
                  const SizedBox(height: 16),
                  _voiceSelector(),
                  const SizedBox(height: 16),
                  _advancedCard(),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: (_loading ||
                            _selectedVoice == null ||
                            _textController.text.trim().isEmpty)
                        ? null
                        : _generate,
                    icon: _loading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.graphic_eq_rounded),
                    label: Text(_loading ? 'Generating…' : 'Generate Speech'),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    _errorBanner(_error!),
                  ],
                  if (_audioBytes != null) ...[
                    const SizedBox(height: 24),
                    _resultCard(),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Row(
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            gradient: AppTheme.heroGradient,
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(Icons.graphic_eq_rounded, color: Colors.white, size: 28),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                'Greyvetro TTS',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: AppColors.deep,
                  letterSpacing: -0.3,
                ),
              ),
              Text(
                'Turn text into natural speech',
                style: TextStyle(fontSize: 14, color: AppColors.slate),
              ),
            ],
          ),
        ),
        UsageBadge(key: _usageKey, apiClient: widget.apiClient),
      ],
    );
  }

  Widget _textCard(int charCount) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _textController,
              maxLines: 7,
              minLines: 5,
              style: const TextStyle(fontSize: 16, color: AppColors.deep, height: 1.5),
              decoration: const InputDecoration(
                hintText: 'Type or paste the text you want to hear…',
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                contentPadding: EdgeInsets.zero,
              ),
            ),
            const Divider(height: 24),
            Row(
              children: [
                const Icon(Icons.text_fields_rounded, size: 16, color: AppColors.slate),
                const SizedBox(width: 6),
                Text(
                  '$charCount characters',
                  style: const TextStyle(fontSize: 13, color: AppColors.slate),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _voiceSelector() {
    final voice = _selectedVoice;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.card),
        onTap: _openVoicePicker,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: AppColors.babyBlue.withValues(alpha: 0.4),
                child: Icon(
                  voice == null ? Icons.record_voice_over_rounded : Icons.person_rounded,
                  color: AppColors.babyBlueDeep,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      voice?.name ?? 'Choose a voice',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.deep,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      voice == null
                          ? 'Tap to browse available voices'
                          : (voice.isCustom ? 'My voice' : 'Built-in voice'),
                      style: const TextStyle(fontSize: 13, color: AppColors.slate),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.slate),
            ],
          ),
        ),
      ),
    );
  }

  Widget _advancedCard() {
    return Card(
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(AppRadii.card),
            onTap: () => setState(() => _showAdvanced = !_showAdvanced),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.tune_rounded, color: AppColors.babyBlueDeep),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Voice settings',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.deep,
                      ),
                    ),
                  ),
                  Icon(
                    _showAdvanced
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    color: AppColors.slate,
                  ),
                ],
              ),
            ),
          ),
          if (_showAdvanced)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Column(
                children: [
                  _slider(
                    label: 'Stability',
                    hint: 'Lower = more expressive · Higher = more consistent',
                    value: _stability,
                    onChanged: (v) => setState(() => _stability = v),
                  ),
                  _slider(
                    label: 'Similarity',
                    hint: 'How closely to match the original voice',
                    value: _similarity,
                    onChanged: (v) => setState(() => _similarity = v),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _slider({
    required String label,
    required String hint,
    required double value,
    required ValueChanged<double> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: AppColors.deep,
                ),
              ),
            ),
            Text(
              '${(value * 100).round()}%',
              style: const TextStyle(color: AppColors.slate),
            ),
          ],
        ),
        Text(hint, style: const TextStyle(fontSize: 12, color: AppColors.slate)),
        Slider(
          value: value,
          onChanged: onChanged,
          activeColor: AppColors.babyBlueDeep,
          inactiveColor: AppColors.surfaceMuted,
        ),
      ],
    );
  }

  Widget _errorBanner(String message) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.babyPink.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border.all(color: AppColors.babyPinkDeep.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, color: AppColors.babyPinkDeep),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: AppColors.deep, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _resultCard() {
    return ValueListenableBuilder<String?>(
      valueListenable: widget.player.playing,
      builder: (context, playingPath, _) {
        final isPlaying = _tempAudioPath != null && _tempAudioPath == playingPath;
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Row(
                  children: const [
                    Icon(Icons.audiotrack_rounded, color: AppColors.babyBlueDeep),
                    SizedBox(width: 10),
                    Text(
                      'Your audio is ready',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.deep,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _circleAction(
                      icon: isPlaying ? Icons.stop_rounded : Icons.play_arrow_rounded,
                      label: isPlaying ? 'Stop' : 'Play',
                      filled: true,
                      onTap: _togglePlayback,
                    ),
                    const SizedBox(width: 24),
                    _circleAction(
                      icon: _saved ? Icons.check_rounded : Icons.bookmark_add_rounded,
                      label: _saved ? 'Saved' : 'Save to Gallery',
                      filled: false,
                      onTap: _saved ? null : _saveToGallery,
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _circleAction({
    required IconData icon,
    required String label,
    required bool filled,
    required VoidCallback? onTap,
  }) {
    final enabled = onTap != null;
    return Column(
      children: [
        Material(
          color: filled ? AppColors.babyBlueDeep : AppColors.surface,
          shape: const CircleBorder(
            side: BorderSide(color: AppColors.outline),
          ),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Icon(
                icon,
                size: 32,
                color: filled
                    ? Colors.white
                    : (enabled ? AppColors.deep : AppColors.slate),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(fontSize: 13, color: AppColors.slate)),
      ],
    );
  }
}
