import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/audio_player.dart';
import '../../core/theme.dart';
import '../voices/voice_model.dart';
import '../voices/voice_picker.dart';
import 'preset.dart';
import 'preset_repository.dart';

/// Full editor for an existing preset: name, voice, and the four settings.
/// Saves via [PresetRepository.update] and pops `true` on success so the
/// list can refresh. Blocks saving if another preset has identical settings.
class PresetEditorScreen extends StatefulWidget {
  final Preset preset;
  final PresetRepository repository;
  final ApiClient apiClient;
  final AudioPlayer player;

  const PresetEditorScreen({
    super.key,
    required this.preset,
    required this.repository,
    required this.apiClient,
    required this.player,
  });

  @override
  State<PresetEditorScreen> createState() => _PresetEditorScreenState();
}

class _PresetEditorScreenState extends State<PresetEditorScreen> {
  late final TextEditingController _nameController;
  late String _voiceId;
  late String _voiceName;
  late double _stability;
  late double _similarity;
  late double _style;
  late bool _speakerBoost;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final p = widget.preset;
    _nameController = TextEditingController(text: p.name);
    _voiceId = p.voiceId;
    _voiceName = p.voiceName;
    _stability = p.stability;
    _similarity = p.similarityBoost;
    _style = p.style;
    _speakerBoost = p.useSpeakerBoost;
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _openVoicePicker() async {
    final voice = await showVoicePicker(
      context,
      apiClient: widget.apiClient,
      player: widget.player,
      selected: VoiceModel(
        id: _voiceId,
        name: _voiceName,
        description: '',
        isCustom: false,
      ),
    );
    if (voice != null) {
      setState(() {
        _voiceId = voice.id;
        _voiceName = voice.name;
      });
    }
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Give the preset a name')),
      );
      return;
    }
    setState(() => _saving = true);
    final dup = await widget.repository.findMatching(
      voiceId: _voiceId,
      stability: _stability,
      similarityBoost: _similarity,
      style: _style,
      useSpeakerBoost: _speakerBoost,
      excludeId: widget.preset.id,
    );
    if (dup != null) {
      setState(() => _saving = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('These settings already exist as “${dup.name}”'),
            backgroundColor: context.brand.pinkDeep,
          ),
        );
      }
      return;
    }
    await widget.repository.update(
      widget.preset.copyWith(
        name: name,
        voiceId: _voiceId,
        voiceName: _voiceName,
        stability: _stability,
        similarityBoost: _similarity,
        style: _style,
        useSpeakerBoost: _speakerBoost,
      ),
    );
    if (mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.brand;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit preset'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilledButton(
              onPressed: _saving ? null : _save,
              child: const Text('Save'),
            ),
          ),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Preset name',
                  hintText: 'e.g. Warm narration',
                ),
              ),
              const SizedBox(height: 18),
              Card(
                child: InkWell(
                  borderRadius: BorderRadius.circular(AppRadii.card),
                  onTap: _openVoicePicker,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            gradient: c.sliderGradient,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            _voiceName.isNotEmpty
                                ? _voiceName.characters.first.toUpperCase()
                                : '?',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        const SizedBox(width: 13),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _voiceName,
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: c.text,
                                ),
                              ),
                              const SizedBox(height: 1),
                              Text(
                                'Tap to change voice',
                                style: TextStyle(fontSize: 12, color: c.text3),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_right_rounded, color: c.text3),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Card(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                  child: Column(
                    children: [
                      _slider(
                        label: 'Stability',
                        hint: 'Lower = more expressive · Higher = more consistent',
                        value: _stability,
                        onChanged: (v) => setState(() => _stability = v),
                      ),
                      const SizedBox(height: 12),
                      _slider(
                        label: 'Similarity',
                        hint: 'How closely to match the original voice',
                        value: _similarity,
                        onChanged: (v) => setState(() => _similarity = v),
                      ),
                      const SizedBox(height: 12),
                      _slider(
                        label: 'Style',
                        hint:
                            'Higher = more expressive · 0 = most neutral & stable',
                        value: _style,
                        onChanged: (v) => setState(() => _style = v),
                      ),
                      const SizedBox(height: 4),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        activeThumbColor: Colors.white,
                        activeTrackColor: c.blueDeep,
                        value: _speakerBoost,
                        onChanged: (v) => setState(() => _speakerBoost = v),
                        title: Text(
                          'Speaker boost',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13.5,
                            color: c.text,
                          ),
                        ),
                        subtitle: Text(
                          'Boosts resemblance to your original voice',
                          style: TextStyle(fontSize: 11.5, color: c.text3),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _slider({
    required String label,
    required String hint,
    required double value,
    required ValueChanged<double> onChanged,
  }) {
    final c = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: c.text,
                ),
              ),
            ),
            Text(
              '${(value * 100).round()}%',
              style: AppFonts.monoStyle(size: 12, color: c.blueDeep),
            ),
          ],
        ),
        Text(hint, style: TextStyle(fontSize: 11, color: c.text3)),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 6,
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
          ),
          child: Slider(
            value: value,
            onChanged: onChanged,
            activeColor: c.blueDeep,
            inactiveColor: c.outline,
          ),
        ),
      ],
    );
  }
}
