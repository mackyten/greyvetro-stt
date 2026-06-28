using ElevenLabs;
using ElevenLabs.Models;
using ElevenLabs.TextToSpeech;
using ElevenLabs.Voices;
using Greyvetro.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace Greyvetro.Infrastructure.ElevenLabs;

public class ElevenLabsService(ElevenLabsClient client, ILogger<ElevenLabsService> logger) : IElevenLabsService
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
        var voiceSettings = new VoiceSettings(request.Stability, request.SimilarityBoost, 0f, false, 1f);
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
}
