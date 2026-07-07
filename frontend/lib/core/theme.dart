import 'package:flutter/material.dart';

/// Greyvetro brand palette and Material 3 themes (light + dark).
///
/// Soft greys with baby-blue (primary) and baby-pink (secondary) accents,
/// refined per the Turn 5 design-system spec. Screens should read
/// theme-aware colours from [BrandColors] (`context.brand`) so they adapt to
/// dark mode; the flat [AppColors] constants below are the light-mode values
/// kept for screens that haven't migrated yet.
class AppColors {
  AppColors._();

  // Brand accents (light-mode values — see BrandColors for dark).
  static const babyBlue = Color(0xFF8FD0E8);
  static const babyBlueDeep = Color(0xFF3E9AC4); // contrast on light surfaces
  static const babyPink = Color(0xFFFBCAD4);
  static const babyPinkDeep = Color(0xFFE58D9E);

  // Greys
  static const background = Color(0xFFEEF1F5);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF3F5F8);
  static const slate = Color(0xFF5A6472); // body text (text-2)
  static const deep = Color(0xFF212832); // headings (text-1)
  static const outline = Color(0xFFE3E8EE);

  // Semantic
  static const danger = Color(0xFFE0607A);
  static const warning = Color(0xFFF0C070);
  static const success = Color(0xFF2FA96A);
}

class AppRadii {
  AppRadii._();
  static const card = 20.0;
  static const field = 14.0; // fields / buttons (13–16)
  static const icon = 11.0; // icon buttons
  static const pill = 999.0;
}

class AppFonts {
  AppFonts._();
  static const sans = 'Manrope';
  static const mono = 'JetBrains Mono'; // numeric & meta

  /// Convenience for JetBrains Mono runs (counts, timecodes, credits, eyebrows).
  static TextStyle monoStyle({
    double size = 12,
    FontWeight weight = FontWeight.w400,
    Color? color,
    double letterSpacing = 0,
  }) => TextStyle(
    fontFamily: mono,
    fontSize: size,
    fontWeight: weight,
    color: color,
    letterSpacing: letterSpacing,
  );
}

/// Theme-aware brand tokens. Read via `Theme.of(context).extension<BrandColors>()`
/// or the `context.brand` shorthand.
@immutable
class BrandColors extends ThemeExtension<BrandColors> {
  const BrandColors({
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.outline,
    required this.text,
    required this.text2,
    required this.text3,
    required this.blue,
    required this.blueDeep,
    required this.pink,
    required this.pinkDeep,
    required this.success,
    required this.warning,
    required this.danger,
    required this.heroGradient,
    required this.sliderGradient,
    required this.onAccent,
  });

  final Color background;
  final Color surface;
  final Color surfaceMuted;
  final Color outline;
  final Color text; // headings / primary text
  final Color text2; // body
  final Color text3; // muted / meta
  final Color blue;
  final Color blueDeep;
  final Color pink;
  final Color pinkDeep;
  final Color success;
  final Color warning;
  final Color danger;
  final LinearGradient heroGradient; // blue → pink (buttons, hero tiles)
  final LinearGradient sliderGradient; // blueDeep → pinkDeep (filled tracks)
  final Color onAccent; // text/icon colour sitting on the hero gradient

  static const light = BrandColors(
    background: Color(0xFFEEF1F5),
    surface: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFF3F5F8),
    outline: Color(0xFFE3E8EE),
    text: Color(0xFF212832),
    text2: Color(0xFF5A6472),
    text3: Color(0xFF8B95A2),
    blue: Color(0xFF8FD0E8),
    blueDeep: Color(0xFF3E9AC4),
    pink: Color(0xFFFBCAD4),
    pinkDeep: Color(0xFFE58D9E),
    success: Color(0xFF2FA96A),
    warning: Color(0xFFF0C070),
    danger: Color(0xFFE0607A),
    heroGradient: LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF8FD0E8), Color(0xFFFBCAD4)],
    ),
    sliderGradient: LinearGradient(
      colors: [Color(0xFF3E9AC4), Color(0xFFE58D9E)],
    ),
    onAccent: Color(0xFF17303A),
  );

  static const dark = BrandColors(
    background: Color(0xFF12151A),
    surface: Color(0xFF1A1F26),
    surfaceMuted: Color(0xFF232A33),
    outline: Color(0xFF2C333F),
    text: Color(0xFFECEFF3),
    text2: Color(0xFFA6B0BD),
    text3: Color(0xFF727C89),
    blue: Color(0xFF79C1DE),
    blueDeep: Color(0xFF8FD4EE),
    pink: Color(0xFFF0B4C2),
    pinkDeep: Color(0xFFEFA2B2),
    success: Color(0xFF2FA96A),
    warning: Color(0xFFF0C070),
    danger: Color(0xFFE0607A),
    heroGradient: LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF79C1DE), Color(0xFFF0B4C2)],
    ),
    sliderGradient: LinearGradient(
      colors: [Color(0xFF8FD4EE), Color(0xFFEFA2B2)],
    ),
    onAccent: Color(0xFF17303A),
  );

  @override
  BrandColors copyWith({
    Color? background,
    Color? surface,
    Color? surfaceMuted,
    Color? outline,
    Color? text,
    Color? text2,
    Color? text3,
    Color? blue,
    Color? blueDeep,
    Color? pink,
    Color? pinkDeep,
    Color? success,
    Color? warning,
    Color? danger,
    LinearGradient? heroGradient,
    LinearGradient? sliderGradient,
    Color? onAccent,
  }) {
    return BrandColors(
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      outline: outline ?? this.outline,
      text: text ?? this.text,
      text2: text2 ?? this.text2,
      text3: text3 ?? this.text3,
      blue: blue ?? this.blue,
      blueDeep: blueDeep ?? this.blueDeep,
      pink: pink ?? this.pink,
      pinkDeep: pinkDeep ?? this.pinkDeep,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      heroGradient: heroGradient ?? this.heroGradient,
      sliderGradient: sliderGradient ?? this.sliderGradient,
      onAccent: onAccent ?? this.onAccent,
    );
  }

  @override
  BrandColors lerp(ThemeExtension<BrandColors>? other, double t) {
    if (other is! BrandColors) return this;
    return BrandColors(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceMuted: Color.lerp(surfaceMuted, other.surfaceMuted, t)!,
      outline: Color.lerp(outline, other.outline, t)!,
      text: Color.lerp(text, other.text, t)!,
      text2: Color.lerp(text2, other.text2, t)!,
      text3: Color.lerp(text3, other.text3, t)!,
      blue: Color.lerp(blue, other.blue, t)!,
      blueDeep: Color.lerp(blueDeep, other.blueDeep, t)!,
      pink: Color.lerp(pink, other.pink, t)!,
      pinkDeep: Color.lerp(pinkDeep, other.pinkDeep, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      heroGradient: LinearGradient.lerp(heroGradient, other.heroGradient, t)!,
      sliderGradient:
          LinearGradient.lerp(sliderGradient, other.sliderGradient, t)!,
      onAccent: Color.lerp(onAccent, other.onAccent, t)!,
    );
  }
}

/// `context.brand` — theme-aware brand tokens.
extension BrandColorsX on BuildContext {
  BrandColors get brand =>
      Theme.of(this).extension<BrandColors>() ?? BrandColors.light;
}

class AppTheme {
  AppTheme._();

  static ThemeData get light => _build(BrandColors.light, Brightness.light);
  static ThemeData get dark => _build(BrandColors.dark, Brightness.dark);

  static ThemeData _build(BrandColors c, Brightness brightness) {
    final scheme =
        ColorScheme.fromSeed(
          seedColor: c.blueDeep,
          brightness: brightness,
        ).copyWith(
          primary: c.blueDeep,
          onPrimary: brightness == Brightness.light ? Colors.white : c.onAccent,
          secondary: c.pinkDeep,
          onSecondary: c.onAccent,
          surface: c.surface,
          onSurface: c.text,
          surfaceContainerHighest: c.surfaceMuted,
          outline: c.outline,
          error: c.danger,
        );

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.background,
      fontFamily: AppFonts.sans,
      extensions: [c],
    );

    final t = base.textTheme;
    return base.copyWith(
      textTheme: t
          .copyWith(
            displayLarge: t.displayLarge?.copyWith(
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
            ),
            headlineMedium: t.headlineMedium?.copyWith(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
            titleLarge: t.titleLarge?.copyWith(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
            titleMedium: t.titleMedium?.copyWith(
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
            bodyLarge: t.bodyLarge?.copyWith(
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
            bodyMedium: t.bodyMedium?.copyWith(
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            labelLarge: t.labelLarge?.copyWith(fontWeight: FontWeight.w700),
          )
          .apply(bodyColor: c.text2, displayColor: c.text),
      appBarTheme: AppBarTheme(
        backgroundColor: c.background,
        foregroundColor: c.text,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: AppFonts.sans,
          color: c.text,
          fontSize: 22,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.3,
        ),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.card),
          side: BorderSide(color: c.outline),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surface,
        contentPadding: const EdgeInsets.all(16),
        hintStyle: TextStyle(color: c.text3),
        labelStyle: TextStyle(color: c.text2),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          borderSide: BorderSide(color: c.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          borderSide: BorderSide(color: c.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          borderSide: BorderSide(color: c.blueDeep, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: c.blueDeep,
          foregroundColor: brightness == Brightness.light
              ? Colors.white
              : c.onAccent,
          disabledBackgroundColor: c.surfaceMuted,
          disabledForegroundColor: c.text3,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
          textStyle: const TextStyle(
            fontFamily: AppFonts.sans,
            fontSize: 15,
            fontWeight: FontWeight.w800,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: c.text,
          backgroundColor: c.surface,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
          textStyle: const TextStyle(
            fontFamily: AppFonts.sans,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
          side: BorderSide(color: c.outline),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
        ),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: c.blueDeep,
        inactiveTrackColor: c.outline,
        thumbColor: c.blueDeep,
        overlayColor: c.blueDeep.withValues(alpha: 0.14),
        trackHeight: 6,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.all(Colors.white),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? c.blueDeep
              : c.outline,
        ),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
        ),
        selectedTileColor: c.blue.withValues(alpha: 0.22),
        selectedColor: c.text,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        // Dark snackbar in both themes (per Turn 5 feedback spec).
        backgroundColor: const Color(0xFF232A33),
        contentTextStyle: const TextStyle(
          fontFamily: AppFonts.sans,
          color: Color(0xFFECEFF3),
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      dividerTheme: DividerThemeData(color: c.outline, thickness: 1),
      dialogTheme: DialogThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.card),
          side: BorderSide(color: c.outline),
        ),
        titleTextStyle: TextStyle(
          fontFamily: AppFonts.sans,
          fontSize: 18,
          fontWeight: FontWeight.w800,
          color: c.text,
        ),
        contentTextStyle: TextStyle(
          fontFamily: AppFonts.sans,
          fontSize: 14,
          color: c.text2,
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: c.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: c.outline),
        ),
        textStyle: TextStyle(fontFamily: AppFonts.sans, color: c.text),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: c.surface,
        side: BorderSide(color: c.outline),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        labelStyle: TextStyle(fontFamily: AppFonts.sans, color: c.text),
      ),
    );
  }

  /// Soft brand gradient for hero surfaces (baby blue → baby pink), light mode.
  /// Prefer `context.brand.heroGradient` for theme-aware use.
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.babyBlue, AppColors.babyPink],
  );
}
