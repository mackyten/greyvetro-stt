import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/audio_player.dart';
import '../../core/theme.dart';
import 'voice_model.dart';
import 'voices_screen.dart';

/// Presents the voice picker as a centered desktop modal and resolves to the
/// chosen voice (or null if dismissed). Shared by the composer and the preset
/// editor so both behave identically.
Future<VoiceModel?> showVoicePicker(
  BuildContext context, {
  required ApiClient apiClient,
  required AudioPlayer player,
  VoiceModel? selected,
}) {
  return showDialog<VoiceModel>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.45),
    builder: (ctx) {
      final c = ctx.brand;
      final size = MediaQuery.of(ctx).size;
      final width = (size.width - 48).clamp(0.0, 560.0);
      final height = (size.height * 0.82).clamp(0.0, 700.0);
      return Dialog(
        backgroundColor: c.background,
        insetPadding: const EdgeInsets.all(24),
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: BorderSide(color: c.outline),
        ),
        child: SizedBox(
          width: width,
          height: height,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 16, 12, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Select a voice',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                          color: c.text,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: Icon(Icons.close_rounded, color: c.text2),
                      tooltip: 'Close',
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: c.outline),
              Expanded(
                child: VoicesScreen(
                  apiClient: apiClient,
                  player: player,
                  selectedVoice: selected,
                  onVoiceSelected: (v) => Navigator.pop(ctx, v),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
