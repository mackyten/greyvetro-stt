/// A saved bundle of voice + generation settings that can be re-applied to the
/// composer. Text is intentionally excluded — a preset is a "sound", not content.
class Preset {
  final String id;
  final String name;
  final String voiceId;
  final String voiceName;
  final double stability;
  final double similarityBoost;
  final double style;
  final bool useSpeakerBoost;
  final DateTime createdAt;

  const Preset({
    required this.id,
    required this.name,
    required this.voiceId,
    required this.voiceName,
    required this.stability,
    required this.similarityBoost,
    this.style = 0.0,
    this.useSpeakerBoost = false,
    required this.createdAt,
  });

  Preset copyWith({
    String? name,
    String? voiceId,
    String? voiceName,
    double? stability,
    double? similarityBoost,
    double? style,
    bool? useSpeakerBoost,
  }) =>
      Preset(
        id: id,
        name: name ?? this.name,
        voiceId: voiceId ?? this.voiceId,
        voiceName: voiceName ?? this.voiceName,
        stability: stability ?? this.stability,
        similarityBoost: similarityBoost ?? this.similarityBoost,
        style: style ?? this.style,
        useSpeakerBoost: useSpeakerBoost ?? this.useSpeakerBoost,
        createdAt: createdAt,
      );

  /// True when the *settings* (voice + the four values) match, ignoring the
  /// preset's name and id. Used to detect duplicate presets.
  bool hasSameSettings({
    required String voiceId,
    required double stability,
    required double similarityBoost,
    required double style,
    required bool useSpeakerBoost,
  }) {
    bool near(double a, double b) => (a - b).abs() < 0.0005;
    return this.voiceId == voiceId &&
        this.useSpeakerBoost == useSpeakerBoost &&
        near(this.stability, stability) &&
        near(this.similarityBoost, similarityBoost) &&
        near(this.style, style);
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'voiceId': voiceId,
        'voiceName': voiceName,
        'stability': stability,
        'similarityBoost': similarityBoost,
        'style': style,
        'useSpeakerBoost': useSpeakerBoost,
        'createdAt': createdAt.toIso8601String(),
      };

  factory Preset.fromJson(Map<String, dynamic> json) => Preset(
        id: json['id'] as String,
        name: json['name'] as String? ?? 'Preset',
        voiceId: json['voiceId'] as String? ?? '',
        voiceName: json['voiceName'] as String? ?? 'Unknown voice',
        stability: (json['stability'] as num?)?.toDouble() ?? 0.5,
        similarityBoost: (json['similarityBoost'] as num?)?.toDouble() ?? 0.75,
        style: (json['style'] as num?)?.toDouble() ?? 0.0,
        useSpeakerBoost: json['useSpeakerBoost'] as bool? ?? false,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
      );
}
