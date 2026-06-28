import 'dart:io';
import 'package:flutter/foundation.dart';

/// Minimal audio player. Currently shells out to macOS `afplay`.
///
/// NOTE: macOS-only. Replace with a cross-platform package (e.g. just_audio)
/// when Windows support is needed — see CLAUDE.md known issues.
class AudioPlayer {
  Process? _process;

  /// Absolute path of the file currently playing, or null. Listenable so
  /// widgets can reflect play/stop state.
  final ValueNotifier<String?> playing = ValueNotifier(null);

  bool isPlaying(String path) => playing.value == path;

  Future<void> toggle(String path) async {
    if (playing.value == path) {
      await stop();
    } else {
      await play(path);
    }
  }

  Future<void> play(String path) async {
    await stop();
    final process = await Process.start('afplay', [path]);
    _process = process;
    playing.value = path;
    process.exitCode.then((_) {
      if (_process == process) {
        _process = null;
        playing.value = null;
      }
    });
  }

  Future<void> stop() async {
    _process?.kill();
    _process = null;
    playing.value = null;
  }

  void dispose() {
    _process?.kill();
    playing.dispose();
  }
}
