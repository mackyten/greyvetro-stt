class VoiceModel {
  final String id;
  final String name;
  final String description;
  final bool isCustom;
  final String? previewUrl;
  final Map<String, String> labels;

  const VoiceModel({
    required this.id,
    required this.name,
    required this.description,
    required this.isCustom,
    this.previewUrl,
    this.labels = const {},
  });

  /// Common ElevenLabs label dimensions (may be absent).
  String? get gender => labels['gender'];
  String? get accent => labels['accent'];
  String? get age => labels['age'];
  String? get useCase => labels['use case'] ?? labels['use_case'] ?? labels['useCase'];

  /// Short descriptor line built from the most useful labels.
  String get tagline {
    final parts = [gender, accent, age, useCase]
        .where((e) => e != null && e.trim().isNotEmpty)
        .map((e) => e!.trim())
        .toList();
    if (parts.isNotEmpty) return parts.join(' · ');
    return description;
  }

  factory VoiceModel.fromJson(Map<String, dynamic> json) {
    final rawLabels = json['labels'] as Map<String, dynamic>?;
    return VoiceModel(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      isCustom: json['isCustom'] as bool? ?? false,
      previewUrl: json['previewUrl'] as String?,
      labels: rawLabels?.map((k, v) => MapEntry(k, v?.toString() ?? '')) ?? const {},
    );
  }
}
