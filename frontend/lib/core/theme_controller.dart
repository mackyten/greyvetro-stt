import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

/// App-wide light/dark theme state, persisted to a small file in the app
/// documents directory (avoids adding a preferences dependency).
///
/// Exposed to the widget tree via [ThemeScope]; the sidebar toggle calls
/// [toggle]. Kept deliberately simple (a [ChangeNotifier], matching the app's
/// setState-first convention).
class ThemeController extends ChangeNotifier {
  ThemeController(this._mode);

  ThemeMode _mode;
  ThemeMode get mode => _mode;

  /// Whether the app is currently rendering dark. When [mode] is
  /// [ThemeMode.system], resolves against the platform brightness.
  bool isDark(BuildContext context) => switch (_mode) {
    ThemeMode.dark => true,
    ThemeMode.light => false,
    ThemeMode.system =>
      MediaQuery.platformBrightnessOf(context) == Brightness.dark,
  };

  static Future<File> _file() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/greyvetro_theme');
  }

  /// Loads the persisted preference, defaulting to following the system.
  static Future<ThemeController> load() async {
    var mode = ThemeMode.system;
    try {
      final f = await _file();
      if (await f.exists()) {
        final saved = (await f.readAsString()).trim();
        mode = ThemeMode.values.firstWhere(
          (m) => m.name == saved,
          orElse: () => ThemeMode.system,
        );
      }
    } catch (_) {
      // Fall back to system on any read error.
    }
    return ThemeController(mode);
  }

  Future<void> setMode(ThemeMode next) async {
    if (next == _mode) return;
    _mode = next;
    notifyListeners();
    try {
      await (await _file()).writeAsString(next.name);
    } catch (_) {
      // Persistence is best-effort.
    }
  }

  /// Flips between explicit light and dark (relative to what's showing now).
  Future<void> toggle(BuildContext context) =>
      setMode(isDark(context) ? ThemeMode.light : ThemeMode.dark);
}

/// Provides the [ThemeController] to descendants and rebuilds them on change.
/// Read with `ThemeScope.of(context)`.
class ThemeScope extends InheritedNotifier<ThemeController> {
  const ThemeScope({
    super.key,
    required ThemeController controller,
    required super.child,
  }) : super(notifier: controller);

  static ThemeController of(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<ThemeScope>();
    assert(scope != null, 'No ThemeScope found in context');
    return scope!.notifier!;
  }
}
