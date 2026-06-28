class UsageModel {
  final int characterCount;
  final int characterLimit;
  final String tier;
  final bool canCloneVoices;
  final DateTime? nextReset;

  const UsageModel({
    required this.characterCount,
    required this.characterLimit,
    required this.tier,
    required this.canCloneVoices,
    this.nextReset,
  });

  int get remaining =>
      (characterLimit - characterCount).clamp(0, characterLimit);

  double get usedFraction =>
      characterLimit == 0 ? 0 : (characterCount / characterLimit).clamp(0.0, 1.0);

  factory UsageModel.fromJson(Map<String, dynamic> json) => UsageModel(
        characterCount: json['characterCount'] as int? ?? 0,
        characterLimit: json['characterLimit'] as int? ?? 0,
        tier: json['tier'] as String? ?? '',
        canCloneVoices: json['canCloneVoices'] as bool? ?? false,
        nextReset: json['nextReset'] != null
            ? DateTime.tryParse(json['nextReset'].toString())
            : null,
      );
}
