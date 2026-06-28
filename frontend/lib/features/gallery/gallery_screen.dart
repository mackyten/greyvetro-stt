import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/audio_player.dart';
import '../../core/theme.dart';
import 'gallery_item.dart';
import 'gallery_repository.dart';

class GalleryScreen extends StatefulWidget {
  final GalleryRepository repository;
  final AudioPlayer player;
  final ValueChanged<GalleryItem> onEdit;

  const GalleryScreen({
    super.key,
    required this.repository,
    required this.player,
    required this.onEdit,
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
            style: FilledButton.styleFrom(backgroundColor: AppColors.babyPinkDeep),
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
            backgroundColor: AppColors.babyPinkDeep,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    if (items == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (items.isEmpty) return _empty();

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView.separated(
        padding: const EdgeInsets.all(20),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, i) => _card(items[i]),
      ),
    );
  }

  Widget _empty() => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(Icons.library_music_rounded, size: 56, color: AppColors.babyBlueDeep),
            SizedBox(height: 16),
            Text(
              'No saved audio yet',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.deep,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Generate speech and tap “Save to Gallery”.',
              style: TextStyle(color: AppColors.slate),
            ),
          ],
        ),
      );

  Widget _card(GalleryItem item) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.babyBlue.withValues(alpha: 0.4),
                  child: const Icon(Icons.person_rounded,
                      size: 18, color: AppColors.babyBlueDeep),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.voiceName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: AppColors.deep,
                        ),
                      ),
                      Text(
                        _formatDate(item.createdAt),
                        style: const TextStyle(fontSize: 12, color: AppColors.slate),
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
              style: const TextStyle(fontSize: 14, color: AppColors.slate, height: 1.4),
            ),
            const Divider(height: 24),
            ValueListenableBuilder<String?>(
              valueListenable: widget.player.playing,
              builder: (context, playingPath, _) {
                return FutureBuilder<String>(
                  future: widget.repository.filePath(item),
                  builder: (context, snap) {
                    final isPlaying = snap.data != null && snap.data == playingPath;
                    return Row(
                      children: [
                        _action(
                          icon: isPlaying
                              ? Icons.stop_rounded
                              : Icons.play_arrow_rounded,
                          label: isPlaying ? 'Stop' : 'Play',
                          onTap: () => _play(item),
                          primary: true,
                        ),
                        const Spacer(),
                        _iconBtn(Icons.edit_rounded, 'Edit & regenerate',
                            () => widget.onEdit(item)),
                        _iconBtn(Icons.download_rounded, 'Export', () => _export(item)),
                        _iconBtn(Icons.delete_outline_rounded, 'Delete',
                            () => _delete(item)),
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

  Widget _action({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool primary = false,
  }) {
    return FilledButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 20),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: primary ? AppColors.babyBlueDeep : AppColors.surfaceMuted,
        foregroundColor: primary ? Colors.white : AppColors.deep,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      ),
    );
  }

  Widget _iconBtn(IconData icon, String tooltip, VoidCallback onTap) => IconButton(
        icon: Icon(icon, color: AppColors.slate),
        tooltip: tooltip,
        onPressed: onTap,
      );

  String _formatDate(DateTime dt) {
    final d = dt.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)}  ${two(d.hour)}:${two(d.minute)}';
  }
}
