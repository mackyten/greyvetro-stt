import 'package:flutter/material.dart';
import 'audio_player.dart';
import 'theme.dart';

/// A seek bar + elapsed/total time labels bound to [player].
///
/// Render this only for the track that is currently active — the [player]'s
/// [AudioPlayer.position] / [AudioPlayer.duration] reflect the single playing
/// track, so showing it for an inactive item would mirror the active one.
/// Dragging the slider seeks the audio to that point.
class AudioScrubber extends StatelessWidget {
  final AudioPlayer player;

  const AudioScrubber({super.key, required this.player});

  static String _fmt(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.brand;
    return ValueListenableBuilder<Duration?>(
      valueListenable: player.duration,
      builder: (context, total, _) {
        return ValueListenableBuilder<Duration>(
          valueListenable: player.position,
          builder: (context, position, _) {
            final maxMs = (total ?? Duration.zero).inMilliseconds.toDouble();
            final hasDuration = maxMs > 0;
            final value = position.inMilliseconds.toDouble().clamp(
              0.0,
              hasDuration ? maxMs : 1.0,
            );
            return Column(
              children: [
                SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 5,
                    trackShape: _GradientSliderTrackShape(c.sliderGradient),
                    inactiveTrackColor: c.outline,
                    thumbColor: Colors.white,
                    thumbShape: _RingThumbShape(borderColor: c.blueDeep),
                    overlayColor: c.blueDeep.withValues(alpha: 0.16),
                    overlayShape:
                        const RoundSliderOverlayShape(overlayRadius: 15),
                  ),
                  child: Slider(
                    value: value,
                    max: hasDuration ? maxMs : 1.0,
                    onChanged: hasDuration
                        ? (v) => player.seek(Duration(milliseconds: v.round()))
                        : null,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(_fmt(position),
                          style: AppFonts.monoStyle(size: 10.5, color: c.text3)),
                      Text(_fmt(total ?? Duration.zero),
                          style: AppFonts.monoStyle(size: 10.5, color: c.text3)),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

/// Slider track whose active (played) portion is filled with a gradient.
class _GradientSliderTrackShape extends RoundedRectSliderTrackShape {
  final Gradient gradient;
  const _GradientSliderTrackShape(this.gradient);

  @override
  void paint(
    PaintingContext context,
    Offset offset, {
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required Animation<double> enableAnimation,
    required TextDirection textDirection,
    required Offset thumbCenter,
    Offset? secondaryOffset,
    bool isDiscrete = false,
    bool isEnabled = false,
    double additionalActiveTrackHeight = 2,
  }) {
    final rect = getPreferredRect(
      parentBox: parentBox,
      offset: offset,
      sliderTheme: sliderTheme,
      isEnabled: isEnabled,
      isDiscrete: isDiscrete,
    );
    final radius = Radius.circular(rect.height / 2);

    final inactivePaint = Paint()
      ..color = sliderTheme.inactiveTrackColor ?? const Color(0xFFE3E8EE);
    context.canvas.drawRRect(
      RRect.fromRectAndRadius(rect, radius),
      inactivePaint,
    );

    final activeRight = thumbCenter.dx.clamp(rect.left, rect.right);
    if (activeRight > rect.left) {
      final activeRect = Rect.fromLTRB(
        rect.left,
        rect.top,
        activeRight,
        rect.bottom,
      );
      final activePaint = Paint()..shader = gradient.createShader(rect);
      context.canvas.drawRRect(
        RRect.fromRectAndRadius(activeRect, radius),
        activePaint,
      );
    }
  }
}

/// A white thumb with a coloured ring, matching the design's slider handle.
class _RingThumbShape extends SliderComponentShape {
  final Color borderColor;
  const _RingThumbShape({required this.borderColor});

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) =>
      const Size.fromRadius(8);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    required bool isDiscrete,
    required TextPainter labelPainter,
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required TextDirection textDirection,
    required double value,
    required double textScaleFactor,
    required Size sizeWithOverflow,
  }) {
    final canvas = context.canvas;
    canvas.drawCircle(center, 8, Paint()..color = Colors.white);
    canvas.drawCircle(
      center,
      8,
      Paint()
        ..color = borderColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }
}
