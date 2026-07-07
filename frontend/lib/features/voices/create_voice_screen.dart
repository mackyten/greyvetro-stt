import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import '../../core/api_client.dart';
import '../../core/audio_player.dart';
import '../../core/theme.dart';
import 'voice_model.dart';

class _Sample {
  final String path;
  final String label;
  final bool recorded;
  const _Sample({required this.path, required this.label, required this.recorded});
}

class CreateVoiceScreen extends StatefulWidget {
  final ApiClient apiClient;
  final AudioPlayer player;
  const CreateVoiceScreen({super.key, required this.apiClient, required this.player});

  @override
  State<CreateVoiceScreen> createState() => _CreateVoiceScreenState();
}

class _CreateVoiceScreenState extends State<CreateVoiceScreen> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final _recorder = AudioRecorder();
  final List<_Sample> _samples = [];

  bool _recording = false;
  bool _submitting = false;
  bool? _canClone; // null = unknown/checking
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameController.addListener(() => setState(() {}));
    _checkPlan();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    _recorder.dispose();
    super.dispose();
  }

  Future<void> _checkPlan() async {
    try {
      final usage = await widget.apiClient.getUsage();
      if (mounted) setState(() => _canClone = usage.canCloneVoices);
    } catch (_) {
      if (mounted) setState(() => _canClone = null);
    }
  }

  Future<void> _toggleRecording() async {
    if (_recording) {
      final path = await _recorder.stop();
      setState(() => _recording = false);
      if (path != null) {
        setState(() => _samples.add(_Sample(
              path: path,
              label: 'Recording ${_samples.where((s) => s.recorded).length + 1}',
              recorded: true,
            )));
      }
      return;
    }
    if (!await _recorder.hasPermission()) {
      if (mounted) {
        setState(() => _error = 'Microphone permission denied.');
      }
      return;
    }
    final tmp = await getTemporaryDirectory();
    if (!await tmp.exists()) await tmp.create(recursive: true);
    final path =
        '${tmp.path}/gv_sample_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(), path: path);
    setState(() {
      _recording = true;
      _error = null;
    });
  }

  Future<void> _upload() async {
    // FileType.audio greys out m4a on macOS, so filter by explicit
    // extensions instead — these are the formats ElevenLabs accepts for
    // voice cloning (m4a is what the in-app recorder produces).
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const [
        'm4a', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'aiff', 'mp4', 'webm',
      ],
      allowMultiple: true,
    );
    if (result == null) return;
    setState(() {
      for (final f in result.files) {
        if (f.path != null) {
          _samples.add(_Sample(path: f.path!, label: f.name, recorded: false));
        }
      }
    });
  }

  Future<void> _playSample(_Sample s) async => widget.player.toggle(s.path);

  void _removeSample(_Sample s) {
    if (widget.player.isPlaying(s.path)) widget.player.stop();
    setState(() => _samples.remove(s));
  }

  Future<void> _submit() async {
    if (_nameController.text.trim().isEmpty || _samples.isEmpty) return;
    if (_recording) await _recorder.stop();
    await widget.player.stop();
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final voice = await widget.apiClient.cloneVoice(
        name: _nameController.text.trim(),
        description: _descController.text.trim(),
        samplePaths: _samples.map((s) => s.path).toList(),
      );
      if (mounted) Navigator.pop<VoiceModel>(context, voice);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = !_submitting &&
        _nameController.text.trim().isNotEmpty &&
        _samples.isNotEmpty;

    return Scaffold(
      appBar: AppBar(title: const Text('Create my voice')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                _infoBanner(),
                if (_canClone == false) ...[
                  const SizedBox(height: 12),
                  _planWarning(),
                ],
                const SizedBox(height: 20),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'Voice name'),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _descController,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Description (optional)',
                  ),
                ),
                const SizedBox(height: 24),
                _samplesSection(),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(_error!, style: TextStyle(color: context.brand.danger)),
                ],
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: canSubmit ? _submit : null,
                  icon: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.auto_awesome_rounded),
                  label: Text(_submitting ? 'Creating voice…' : 'Create voice'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _infoBanner() {
    final c = context.brand;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.blue.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border.all(color: c.blue.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.tips_and_updates_rounded, color: c.blueDeep),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Add one or more clear samples of the voice (ideally a minute or '
              'more total, no background noise). Record directly or upload audio files.',
              style: TextStyle(fontSize: 13, color: c.text, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _planWarning() {
    final c = context.brand;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.warning.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border.all(color: c.warning.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          Icon(Icons.workspace_premium_rounded, color: c.warning),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Your current ElevenLabs plan doesn’t include voice cloning. '
              'Upgrade to a paid plan to enable this — you can still prepare '
              'samples now.',
              style: TextStyle(fontSize: 13, color: c.text, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _samplesSection() {
    final c = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'SAMPLES',
          style: AppFonts.monoStyle(
            size: 11,
            color: c.text3,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 10),
        ..._samples.map(_sampleTile),
        if (_samples.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text('No samples yet.', style: TextStyle(color: c.text3)),
          ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _toggleRecording,
                icon: Icon(
                  _recording ? Icons.stop_circle_rounded : Icons.mic_rounded,
                  color: _recording ? c.pinkDeep : c.blueDeep,
                ),
                label: Text(_recording ? 'Stop recording' : 'Record'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _recording ? null : _upload,
                icon: const Icon(Icons.upload_file_rounded),
                label: const Text('Upload'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _sampleTile(_Sample s) {
    final c = context.brand;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(AppRadii.field),
          border: Border.all(color: c.outline),
        ),
        child: ValueListenableBuilder<String?>(
          valueListenable: widget.player.playing,
          builder: (context, playingPath, _) {
            final isPlaying = playingPath == s.path;
            return Row(
              children: [
                IconButton(
                  icon: Icon(isPlaying
                      ? Icons.stop_rounded
                      : Icons.play_arrow_rounded),
                  color: c.blueDeep,
                  onPressed: () => _playSample(s),
                ),
                Icon(
                  s.recorded
                      ? Icons.mic_rounded
                      : Icons.insert_drive_file_rounded,
                  size: 16,
                  color: c.text3,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    s.label,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c.text),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline_rounded),
                  color: c.text3,
                  onPressed: () => _removeSample(s),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
