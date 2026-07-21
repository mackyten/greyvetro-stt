import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';

/// Local persistence for favorite voice ids: a single JSON array stored
/// under the app documents directory (mirrors [PresetRepository]'s pattern).
class FavoritesRepository {
  static const _folder = 'grey_vetro_presets';
  static const _indexFile = 'favorite_voices.json';

  Directory? _dir;

  Future<Directory> _dirRef() async {
    if (_dir != null) return _dir!;
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory('${docs.path}/$_folder');
    if (!await dir.exists()) await dir.create(recursive: true);
    return _dir = dir;
  }

  Future<File> _indexRef() async => File('${(await _dirRef()).path}/$_indexFile');

  Future<Set<String>> load() async {
    final index = await _indexRef();
    if (!await index.exists()) return {};
    try {
      final list = jsonDecode(await index.readAsString()) as List;
      return list.map((e) => e as String).toSet();
    } catch (_) {
      return {};
    }
  }

  Future<void> _save(Set<String> ids) async {
    final index = await _indexRef();
    await index.writeAsString(jsonEncode(ids.toList()));
  }

  /// Flips the voice's favorite state, persists it, and returns the new set.
  Future<Set<String>> toggle(String voiceId) async {
    final ids = await load();
    if (!ids.add(voiceId)) ids.remove(voiceId);
    await _save(ids);
    return ids;
  }
}
