import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/audio_player.dart';
import '../../core/theme.dart';
import 'preset.dart';
import 'preset_editor_screen.dart';
import 'preset_repository.dart';

class PresetsScreen extends StatefulWidget {
  final PresetRepository repository;
  final ApiClient apiClient;
  final AudioPlayer player;

  /// Apply a preset to the composer (switches to the Create tab).
  final ValueChanged<Preset> onApply;

  /// Called after presets are edited/deleted so other views can refresh.
  final VoidCallback onPresetsChanged;

  const PresetsScreen({
    super.key,
    required this.repository,
    required this.apiClient,
    required this.player,
    required this.onApply,
    required this.onPresetsChanged,
  });

  @override
  State<PresetsScreen> createState() => PresetsScreenState();
}

class PresetsScreenState extends State<PresetsScreen> {
  List<Preset>? _items;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    final items = await widget.repository.load();
    if (mounted) setState(() => _items = items);
  }

  Future<void> _edit(Preset p) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PresetEditorScreen(
          preset: p,
          repository: widget.repository,
          apiClient: widget.apiClient,
          player: widget.player,
        ),
      ),
    );
    if (saved == true) {
      await refresh();
      widget.onPresetsChanged();
    }
  }

  Future<void> _delete(Preset p) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete preset?'),
        content: Text('“${p.name}” will be removed permanently.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: context.brand.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.repository.delete(p);
    await refresh();
    widget.onPresetsChanged();
  }

  /// Column count for the masonry grid, by available content width.
  static int _columnsFor(double width) {
    if (width >= 1080) return 3;
    if (width >= 700) return 2;
    return 1;
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    if (items == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: refresh,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final cols = _columnsFor(constraints.maxWidth);
          final pad = constraints.maxWidth >= 700 ? 32.0 : 20.0;
          return SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.all(pad),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _screenHeader(items.length),
                const SizedBox(height: 18),
                if (items.isEmpty)
                  _emptyBody()
                else
                  _masonry(items, cols),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _screenHeader(int count) {
    final c = context.brand;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Text(
            'Presets',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: c.text,
            ),
          ),
        ),
        Text(
          count == 0 ? 'None saved' : '$count preset${count == 1 ? '' : 's'}',
          style: AppFonts.monoStyle(size: 12, color: c.text3),
        ),
      ],
    );
  }

  Widget _masonry(List<Preset> items, int cols) {
    final columns = List.generate(cols, (_) => <Widget>[]);
    for (var i = 0; i < items.length; i++) {
      columns[i % cols].add(
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: _card(items[i]),
        ),
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var ci = 0; ci < cols; ci++) ...[
          if (ci > 0) const SizedBox(width: 14),
          Expanded(child: Column(children: columns[ci])),
        ],
      ],
    );
  }

  Widget _emptyBody() {
    final c = context.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 80),
      child: Column(
        children: [
          Icon(Icons.bookmark_border_rounded, size: 52, color: c.blueDeep),
          const SizedBox(height: 16),
          Text(
            'No presets yet',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: c.text,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Save voice + settings from the composer or gallery.',
            style: TextStyle(color: c.text3),
          ),
        ],
      ),
    );
  }

  Widget _card(Preset p) {
    final c = context.brand;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    gradient: c.sliderGradient,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(Icons.bookmark_rounded,
                      color: Colors.white, size: 18),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.name,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: c.text,
                          fontSize: 15,
                        ),
                      ),
                      Text(
                        p.voiceName,
                        style: TextStyle(fontSize: 11.5, color: c.text3),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 13),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _chip('Stability', '${(p.stability * 100).round()}%'),
                _chip('Similarity', '${(p.similarityBoost * 100).round()}%'),
                _chip('Style', '${(p.style * 100).round()}%'),
                _chip('Boost', p.useSpeakerBoost ? 'on' : 'off'),
              ],
            ),
            Divider(height: 24, color: c.outline),
            Row(
              children: [
                FilledButton.icon(
                  onPressed: () => widget.onApply(p),
                  icon: const Icon(Icons.play_arrow_rounded, size: 20),
                  label: const Text('Use'),
                  style: FilledButton.styleFrom(
                    backgroundColor: c.blueDeep,
                    foregroundColor: Colors.white,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: Icon(Icons.edit_outlined, color: c.text2),
                  tooltip: 'Edit',
                  onPressed: () => _edit(p),
                ),
                IconButton(
                  icon: Icon(Icons.delete_outline_rounded, color: c.text2),
                  tooltip: 'Delete',
                  onPressed: () => _delete(p),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String label, String value) {
    final c = context.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: c.outline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: TextStyle(fontSize: 11.5, color: c.text3)),
          const SizedBox(width: 5),
          Text(
            value,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: c.blueDeep,
            ),
          ),
        ],
      ),
    );
  }
}
