import 'package:flutter/material.dart';
import 'core/theme.dart';
import 'core/theme_controller.dart';
import 'features/home/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final themeController = await ThemeController.load();
  runApp(GreyvetroApp(themeController: themeController));
}

class GreyvetroApp extends StatelessWidget {
  const GreyvetroApp({super.key, required this.themeController});

  final ThemeController themeController;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: themeController,
      builder: (context, _) {
        return ThemeScope(
          controller: themeController,
          child: MaterialApp(
            title: 'Greyvetro Studio',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light,
            darkTheme: AppTheme.dark,
            themeMode: themeController.mode,
            home: const HomeShell(),
          ),
        );
      },
    );
  }
}
