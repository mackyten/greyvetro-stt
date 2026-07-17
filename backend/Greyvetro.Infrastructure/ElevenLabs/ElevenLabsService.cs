using System.Net.Http.Json;
using System.Text.Json.Serialization;
using ElevenLabs;
using ElevenLabs.Models;
using ElevenLabs.TextToSpeech;
using ElevenLabs.Voices;
using Greyvetro.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace Greyvetro.Infrastructure.ElevenLabs;

public class ElevenLabsService(ElevenLabsClient client, HttpClient http, ILogger<ElevenLabsService> logger) : IElevenLabsService
{
    public async Task<IReadOnlyList<Domain.Entities.Voice>> GetVoicesAsync(CancellationToken ct = default)
    {
        var voices = await client.VoicesEndpoint.GetAllVoicesAsync(ct);
        // "premade" = free built-in voices; "cloned" = the user's own (paid) voices.
        // Generated/professional categories are excluded to keep the list free-tier friendly.
        var result = voices
            .Where(v => v.Category is "premade" or "cloned")
            .Select(v => new Domain.Entities.Voice
            {
                Id = v.Id,
                Name = v.Name,
                Description = v.Labels?.TryGetValue("description", out var desc) == true ? desc : string.Empty,
                IsCustom = v.Category == "cloned",
                PreviewUrl = v.PreviewUrl,
                Labels = v.Labels?.ToDictionary() ?? []
            }).ToList();

        logger.LogInformation("Returning {Count} voices", result.Count);
        return result;
    }

    public async Task<Domain.Entities.Usage> GetUsageAsync(CancellationToken ct = default)
    {
        var sub = await client.UserEndpoint.GetSubscriptionInfoAsync(ct);
        return new Domain.Entities.Usage
        {
            CharacterCount = sub.CharacterCount,
            CharacterLimit = sub.CharacterLimit,
            Tier = sub.Tier ?? string.Empty,
            CanCloneVoices = sub.CanUseInstantVoiceCloning,
            NextReset = sub.NextCharacterCountReset
        };
    }

    public async Task<Stream> GenerateSpeechAsync(Domain.Entities.TtsRequest request, CancellationToken ct = default)
    {
        var voice = new Voice(request.VoiceId, string.Empty);
        var voiceSettings = new VoiceSettings(request.Stability, request.SimilarityBoost, request.Style, request.UseSpeakerBoost, 1f);
        var model = new Model(request.ModelId);
        var ttsRequest = new TextToSpeechRequest(
            voice, request.Text, System.Text.Encoding.UTF8, voiceSettings,
            OutputFormat.MP3_44100_128, model, null, null, null, null, null, false, null, null);
        var clip = await client.TextToSpeechEndpoint.TextToSpeechAsync(ttsRequest, null, ct);
        return new MemoryStream(clip.ClipData.ToArray());
    }

    public async Task<Domain.Entities.Voice> CloneVoiceAsync(string name, string description, IEnumerable<Stream> samples, CancellationToken ct = default)
    {
        var request = new VoiceRequest(name, samples, null, description);
        var cloned = await client.VoicesEndpoint.AddVoiceAsync(request, ct);
        return new Domain.Entities.Voice
        {
            Id = cloned.Id,
            Name = cloned.Name,
            Description = description,
            IsCustom = true
        };
    }

    // The ElevenLabs-DotNet SDK (3.7.2) has no speech-to-text endpoint, so Scribe is called directly.
    public async Task<Domain.Entities.Transcript> TranscribeAudioAsync(Stream audio, string fileName, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("scribe_v1"), "model_id");
        var file = new StreamContent(audio);
        form.Add(file, "file", string.IsNullOrWhiteSpace(fileName) ? "audio.mp3" : fileName);

        using var response = await http.PostAsync("v1/speech-to-text", form, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            logger.LogWarning("Scribe transcription failed ({Status}): {Body}", response.StatusCode, body);
            throw new HttpRequestException($"ElevenLabs transcription failed: {body}", null, response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<ScribeResponse>(ct)
            ?? throw new HttpRequestException("ElevenLabs transcription returned an empty response.");

        logger.LogInformation("Transcribed {WordCount} words ({Language})", result.Words?.Count ?? 0, result.LanguageCode);
        return new Domain.Entities.Transcript
        {
            Text = result.Text ?? string.Empty,
            LanguageCode = result.LanguageCode ?? string.Empty,
            Words = result.Words?.Select(w => new Domain.Entities.TranscriptWord
            {
                Text = w.Text ?? string.Empty,
                Start = w.Start,
                End = w.End,
                Type = w.Type ?? "word"
            }).ToList() ?? []
        };
    }

    private sealed record ScribeResponse(
        [property: JsonPropertyName("language_code")] string? LanguageCode,
        [property: JsonPropertyName("text")] string? Text,
        [property: JsonPropertyName("words")] List<ScribeWord>? Words);

    private sealed record ScribeWord(
        [property: JsonPropertyName("text")] string? Text,
        [property: JsonPropertyName("start")] double Start,
        [property: JsonPropertyName("end")] double End,
        [property: JsonPropertyName("type")] string? Type);
}
