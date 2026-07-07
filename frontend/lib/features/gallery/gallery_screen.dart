import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/audio_player.dart';
import '../../core/audio_scrubber.dart';
import '../../core/theme.dart';
import '../presets/preset_repository.dart';
import 'gallery_item.dart';
import 'gallery_repository.dart';

class GalleryScreen extends StatefulWidget {
  final GalleryRepository repository;
  final PresetRepository presets;
  final AudioPlayer player;
  final ValueChanged<GalleryItem> onEdit;

  /// Copy this item's voice + settings into the composer (keeps current text).
  final ValueChanged<GalleryItem> onUseSettings;

  /// Called after a preset is created here, so the Presets tab can refresh.
  final VoidCallback onPresetsChanged;

  const GalleryScreen({
    super.key,
    required this.repository,
    required this.presets,
    required this.player,
    required this.onEdit,
    required this.onUseSettings,
    required this.onPresetsChanged,
  });

  @override
  State<GalleryScreen> createState() => GalleryScreenState();
}

class GalleryScreenState extends State<GalleryScreen> {
  List<GalleryItem>? _items;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    final items = await widget.repository.load();
    if (mounted) setState(() => _items = items);
  }

  Future<void> _play(GalleryItem item) async {
    final path = await widget.repository.filePath(item);
    await widget.player.toggle(path);
  }

  Future<void> _delete(GalleryItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete recording?'),
        content: const Text('This removes the audio file and its entry permanently.'),
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
    if (widget.player.isPlaying(await widget.repository.filePath(item))) {
      await widget.player.stop();
    }
    await widget.repository.delete(item);
    await refresh();
  }

  Future<void> _export(GalleryItem item) async {
    try {
      final downloads = await getDownloadsDirectory();
      if (downloads == null) throw Exception('Downloads directory unavailable');
      final dest = File('${downloads.path}/${item.fileName}');
      await File(await widget.repository.filePath(item)).copy(dest.path);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Exported to ${dest.path}')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Export failed: $e'),
            backgroundColor: context.brand.danger,
          ),
        );
      }
    }
  }

  Future<void> _saveItemAsPreset(GalleryItem item) async {
    final dup = await widget.presets.findMatching(
      voiceId: item.voiceId,
      stability: item.stability,
      similarityBoost: item.similarityBoost,
      style: item.style,
      useSpeakerBoost: item.useSpeakerBoost,
    );
    if (dup != null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('These settings are already saved as “${dup.name}”'),
            backgroundColor: context.brand.pinkDeep,
          ),
        );
      }
      return;
    }
    if (!mounted) return;
    final controller = TextEditingController(text: item.voiceName);
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Save preset'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Preset name',
            hintText: 'e.g. Warm narration',
          ),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (name == null || name.trim().isEmpty) return;
    await widget.presets.add(
      name: name.trim(),
      voiceId: item.voiceId,
      voiceName: item.voiceName,
      stability: item.stability,
      similarityBoost: item.similarityBoost,
      style: item.style,
      useSpeakerBoost: item.useSpeakerBoost,
    );
    widget.onPresetsChanged();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Saved preset “${name.trim()}”')),
      );
    }
  }

  /// Column count for the masonry grid, by available content width.
  static int _columnsFor(double width) {
    if (width >= 1180) return 3;
    if (width >= 780) return 2;
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
          final pad = constraints.maxWidth >= 780 ? 32.0 : 20.0;
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
            'Gallery',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: c.text,
            ),
          ),
        ),
        Text(
          count == 0
              ? 'No recordings'
              : '$count recording${count == 1 ? '' : 's'}',
          style: AppFonts.monoStyle(size: 12, color: c.text3),
        ),
      ],
    );
  }

  /// Round-robin distribution across [cols] columns — a lightweight masonry
  /// that tolerates the variable card heights (text preview + inline scrubber).
  Widget _masonry(List<GalleryItem> items, int cols) {
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
          Icon(Icons.library_music_rounded, size: 52, color: c.blueDeep),
          const SizedBox(height: 16),
          Text(
            'No saved audio yet',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: c.text,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Generate speech and tap “Save to Gallery”.',
            style: TextStyle(color: c.text3),
          ),
        ],
      ),
    );
  }

  Widget _card(GalleryItem item) {
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
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    gradient: c.sliderGradient,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    item.voiceName.isNotEmpty
                        ? item.voiceName.characters.first.toUpperCase()
                        : '?',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.voiceName,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: c.text,
                        ),
                      ),
                      Text(
                        _formatDate(item.createdAt),
                        style: AppFonts.monoStyle(size: 11, color: c.text3),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              item.text,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13.5, color: c.text2, height: 1.45),
            ),
            Divider(height: 24, color: c.outline),
            ValueListenableBuilder<String?>(
              valueListenable: widget.player.playing,
              builder: (context, playingPath, _) {
                return FutureBuilder<String>(
                  future: widget.repository.filePath(item),
                  builder: (context, snap) {
                    final isPlaying =
                        snap.data != null && snap.data == playingPath;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            _playButton(isPlaying, () => _play(item)),
                            const Spacer(),
                            _iconBtn(Icons.edit_outlined, 'Edit & regenerate',
                                () => widget.onEdit(item)),
                            _iconBtn(Icons.download_rounded, 'Export',
                                () => _export(item)),
                            _iconBtn(Icons.delete_outline_rounded, 'Delete',
                                () => _delete(item)),
                            PopupMenuButton<String>(
                              icon: Icon(Icons.more_vert_rounded, color: c.text3),
                              tooltip: 'More',
                              position: PopupMenuPosition.under,
                              onSelected: (v) {
                                if (v == 'use') widget.onUseSettings(item);
                                if (v == 'preset') _saveItemAsPreset(item);
                              },
                              itemBuilder: (_) => const [
                                PopupMenuItem(
                                  value: 'use',
                                  child: ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: Icon(Icons.tune_rounded),
                                    title: Text('Use these settings'),
                                  ),
                                ),
                                PopupMenuItem(
                                  value: 'preset',
                                  child: ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: Icon(Icons.bookmark_add_outlined),
                                    title: Text('Save as preset'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        if (isPlaying)
                          Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: AudioScrubber(player: widget.player),
                          ),
                      ],
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _playButton(bool isPlaying, VoidCallback onTap) {
    final c = context.brand;
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            gradient: c.sliderGradient,
            shape: BoxShape.circle,
          ),
          child: Icon(
            isPlaying ? Icons.stop_rounded : Icons.play_arrow_rounded,
            color: Colors.white,
            size: 21,
          ),
        ),
      ),
    );
  }

  Widget _iconBtn(IconData icon, String tooltip, VoidCallback onTap) =>
      IconButton(
        icon: Icon(icon, color: context.brand.text2),
        tooltip: tooltip,
        onPressed: onTap,
      );

  String _formatDate(DateTime dt) {
    final d = dt.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)}  ${two(d.hour)}:${two(d.minute)}';
  }
}
