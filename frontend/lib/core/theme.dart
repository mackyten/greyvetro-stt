import 'package:flutter/material.dart';

/// Greyvetro brand palette and Material 3 theme.
///
/// Brand: soft greys with baby-blue (primary) and baby-pink (secondary) accents.
class AppColors {
  AppColors._();

  // Brand accents
  static const babyBlue = Color(0xFFA8D8EA);
  static const babyBlueDeep = Color(0xFF6FB3D6); // for contrast on light surfaces
  static const babyPink = Color(0xFFFCD5D5);
  static const babyPinkDeep = Color(0xFFE89BA8);

  // Greys
  static const background = Color(0xFFF4F5F7);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFEDEFF2);
  static const slate = Color(0xFF5B6470); // body text
  static const deep = Color(0xFF2E343D); // headings
  static const outline = Color(0xFFE0E3E8);
}

class AppRadii {
  AppRadii._();
  static const card = 20.0;
  static const field = 16.0;
  static const pill = 999.0;
}

class AppTheme {
  AppTheme._();

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.babyBlueDeep,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.babyBlueDeep,
      onPrimary: Colors.white,
      secondary: AppColors.babyPinkDeep,
      onSecondary: Colors.white,
      surface: AppColors.surface,
      onSurface: AppColors.deep,
      surfaceContainerHighest: AppColors.surfaceMuted,
      outline: AppColors.outline,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.background,
      fontFamily: 'SF Pro Text', // falls back to system sans on non-Apple
    );

    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.slate,
        displayColor: AppColors.deep,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.deep,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppColors.deep,
          fontSize: 22,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.card),
          side: const BorderSide(color: AppColors.outline),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.all(18),
        hintStyle: const TextStyle(color: Color(0xFF9AA1AC)),
        labelStyle: const TextStyle(color: AppColors.slate),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          borderSide: const BorderSide(color: AppColors.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          borderSide: const BorderSide(color: AppColors.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          borderSide: const BorderSide(color: AppColors.babyBlueDeep, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.babyBlueDeep,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 24),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.deep,
          backgroundColor: AppColors.surface,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          side: const BorderSide(color: AppColors.outline),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
        ),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
        ),
        selectedTileColor: AppColors.babyBlue.withValues(alpha: 0.25),
        selectedColor: AppColors.deep,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.deep,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.outline, thickness: 1),
    );
  }

  /// Soft brand gradient for hero surfaces (baby blue → baby pink).
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.babyBlue, AppColors.babyPink],
  );
}
