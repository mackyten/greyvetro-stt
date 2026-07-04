class GalleryItem {
  final String id;
  final String fileName; // relative to the gallery directory
  final String text;
  final String voiceId;
  final String voiceName;
  final double stability;
  final double similarityBoost;
  final double style;
  final bool useSpeakerBoost;
  final DateTime createdAt;

  const GalleryItem({
    required this.id,
    required this.fileName,
    required this.text,
    required this.voiceId,
    required this.voiceName,
    required this.stability,
    required this.similarityBoost,
    this.style = 0.0,
    this.useSpeakerBoost = false,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'fileName': fileName,
        'text': text,
        'voiceId': voiceId,
        'voiceName': voiceName,
        'stability': stability,
        'similarityBoost': similarityBoost,
        'style': style,
        'useSpeakerBoost': useSpeakerBoost,
        'createdAt': createdAt.toIso8601String(),
      };

  factory GalleryItem.fromJson(Map<String, dynamic> json) => GalleryItem(
        id: json['id'] as String,
        fileName: json['fileName'] as String,
        text: json['text'] as String? ?? '',
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
