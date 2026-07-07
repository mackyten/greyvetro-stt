import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'preset.dart';

/// Local persistence for voice-setting presets: a single JSON index stored
/// under the app documents directory (no audio, unlike the gallery).
class PresetRepository {
  static const _folder = 'grey_vetro_presets';
  static const _indexFile = 'presets.json';

  Directory? _dir;

  Future<Directory> _dirRef() async {
    if (_dir != null) return _dir!;
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory('${docs.path}/$_folder');
    if (!await dir.exists()) await dir.create(recursive: true);
    return _dir = dir;
  }

  Future<File> _indexRef() async => File('${(await _dirRef()).path}/$_indexFile');

  Future<List<Preset>> load() async {
    final index = await _indexRef();
    if (!await index.exists()) return [];
    try {
      final list = jsonDecode(await index.readAsString()) as List;
      final items =
          list.map((e) => Preset.fromJson(e as Map<String, dynamic>)).toList();
      // Newest first.
      items.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return items;
    } catch (_) {
      return [];
    }
  }

  Future<void> _save(List<Preset> items) async {
    final index = await _indexRef();
    await index.writeAsString(
      jsonEncode(items.map((e) => e.toJson()).toList()),
    );
  }

  Future<Preset> add({
    required String name,
    required String voiceId,
    required String voiceName,
    required double stability,
    required double similarityBoost,
    double style = 0.0,
    bool useSpeakerBoost = false,
  }) async {
    final preset = Preset(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      name: name,
      voiceId: voiceId,
      voiceName: voiceName,
      stability: stability,
      similarityBoost: similarityBoost,
      style: style,
      useSpeakerBoost: useSpeakerBoost,
      createdAt: DateTime.now(),
    );
    final items = await load();
    items.insert(0, preset);
    await _save(items);
    return preset;
  }

  /// Replace an existing preset (matched by id), preserving list order.
  Future<void> update(Preset preset) async {
    final items = await load();
    final idx = items.indexWhere((e) => e.id == preset.id);
    if (idx == -1) {
      items.insert(0, preset);
    } else {
      items[idx] = preset;
    }
    await _save(items);
  }

  /// The first existing preset whose settings match, or null. Pass [excludeId]
  /// to ignore the preset currently being edited.
  Future<Preset?> findMatching({
    required String voiceId,
    required double stability,
    required double similarityBoost,
    required double style,
    required bool useSpeakerBoost,
    String? excludeId,
  }) async {
    final items = await load();
    for (final p in items) {
      if (p.id == excludeId) continue;
      if (p.hasSameSettings(
        voiceId: voiceId,
        stability: stability,
        similarityBoost: similarityBoost,
        style: style,
        useSpeakerBoost: useSpeakerBoost,
      )) {
        return p;
      }
    }
    return null;
  }

  Future<void> delete(Preset preset) async {
    final items = await load();
    items.removeWhere((e) => e.id == preset.id);
    await _save(items);
  }
}
