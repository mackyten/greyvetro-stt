using System.Net.Http.Json;
using System.Text.Json;
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
        IReadOnlyList<global::ElevenLabs.Voices.Voice> voices;
        try
        {
            voices = await client.VoicesEndpoint.GetAllVoicesAsync(ct);
        }
        catch (HttpRequestException ex)
        {
            throw CleanedError(ex);
        }
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
        global::ElevenLabs.User.SubscriptionInfo sub;
        try
        {
            sub = await client.UserEndpoint.GetSubscriptionInfoAsync(ct);
        }
        catch (HttpRequestException ex)
        {
            throw CleanedError(ex);
        }
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
        try
        {
            var clip = await client.TextToSpeechEndpoint.TextToSpeechAsync(ttsRequest, null, ct);
            return new MemoryStream(clip.ClipData.ToArray());
        }
        catch (HttpRequestException ex)
        {
            throw CleanedError(ex);
        }
    }

    public async Task<Domain.Entities.Voice> CloneVoiceAsync(string name, string description, IEnumerable<Stream> samples, CancellationToken ct = default)
    {
        var request = new VoiceRequest(name, samples, null, description);
        global::ElevenLabs.Voices.Voice cloned;
        try
        {
            cloned = await client.VoicesEndpoint.AddVoiceAsync(request, ct);
        }
        catch (HttpRequestException ex)
        {
            throw CleanedError(ex);
        }
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
            throw new HttpRequestException(ExtractErrorMessage(body), null, response.StatusCode);
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

    // The ElevenLabs-DotNet SDK wraps every non-success response as
    // "<Method> Failed! HTTP status code: <code> | Response body: <raw JSON>" — the JSON
    // itself nests the human-readable text under detail.message (or is a bare string for
    // simple validation errors, e.g. quota-exceeded / plan-required responses). Surfacing
    // the SDK's wrapper as-is would dump that whole string into the UI; pull out just the
    // sentence, same approach as GeminiService.ExtractErrorMessage.
    private static HttpRequestException CleanedError(HttpRequestException ex)
    {
        const string marker = "Response body: ";
        var index = ex.Message.IndexOf(marker, StringComparison.Ordinal);
        var body = index < 0 ? ex.Message : ex.Message[(index + marker.Length)..];
        return new HttpRequestException(ExtractErrorMessage(body), ex, ex.StatusCode);
    }

    private static string ExtractErrorMessage(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("detail", out var detail))
            {
                if (detail.ValueKind == JsonValueKind.String)
                    return detail.GetString() ?? body;
                if (detail.ValueKind == JsonValueKind.Object &&
                    detail.TryGetProperty("message", out var message) &&
                    message.GetString() is { Length: > 0 } text)
                    return text;
            }
        }
        catch (JsonException)
        {
            // Not JSON (or an unexpected shape) — fall through to the raw body.
        }
        return body;
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
