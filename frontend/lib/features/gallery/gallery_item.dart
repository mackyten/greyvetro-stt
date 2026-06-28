class GalleryItem {
  final String id;
  final String fileName; // relative to the gallery directory
  final String text;
  final String voiceId;
  final String voiceName;
  final double stability;
  final double similarityBoost;
  final DateTime createdAt;

  const GalleryItem({
    required this.id,
    required this.fileName,
    required this.text,
    required this.voiceId,
    required this.voiceName,
    required this.stability,
    required this.similarityBoost,
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
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
      );
}
