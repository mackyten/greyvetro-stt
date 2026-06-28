import 'package:flutter/material.dart';
import 'core/theme.dart';
import 'features/home/home_shell.dart';

void main() {
  runApp(const GreyvetroApp());
}

class GreyvetroApp extends StatelessWidget {
  const GreyvetroApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Greyvetro TTS',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const HomeShell(),
    );
  }
}
