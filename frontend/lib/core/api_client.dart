import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../features/usage/usage_model.dart';
import '../features/voices/voice_model.dart';

class ApiClient {
  static const _base = 'http://localhost:5050';
  final _client = http.Client();

  Future<List<VoiceModel>> getVoices() async {
    final res = await _client.get(Uri.parse('$_base/voices'));
    _checkStatus(res);
    final list = jsonDecode(res.body) as List;
    return list.map((e) => VoiceModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<UsageModel> getUsage() async {
    final res = await _client.get(Uri.parse('$_base/usage'));
    _checkStatus(res);
    return UsageModel.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<Uint8List> generateSpeech({
    required String text,
    required String voiceId,
    double stability = 0.5,
    double similarityBoost = 0.75,
    double style = 0.0,
    bool useSpeakerBoost = false,
  }) async {
    final res = await _client.post(
      Uri.parse('$_base/tts'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'text': text,
        'voiceId': voiceId,
        'stability': stability,
        'similarityBoost': similarityBoost,
        'style': style,
        'useSpeakerBoost': useSpeakerBoost,
      }),
    );
    _checkStatus(res);
    return res.bodyBytes;
  }

  Future<VoiceModel> cloneVoice({
    required String name,
    required String description,
    required List<String> samplePaths,
  }) async {
    final req = http.MultipartRequest('POST', Uri.parse('$_base/voices/clone'))
      ..fields['name'] = name
      ..fields['description'] = description;
    for (final path in samplePaths) {
      req.files.add(await http.MultipartFile.fromPath('files', path));
    }
    final res = await http.Response.fromStream(await _client.send(req));
    _checkStatus(res);
    return VoiceModel.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  void _checkStatus(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('API error ${res.statusCode}: ${res.body}');
    }
  }

  void dispose() => _client.close();
}
