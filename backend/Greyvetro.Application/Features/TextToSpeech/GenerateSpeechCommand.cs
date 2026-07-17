using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.TextToSpeech;

public record GenerateSpeechCommand(
    string Text,
    string VoiceId,
    float Stability = 0.5f,
    float SimilarityBoost = 0.75f,
    float Style = 0f,
    bool UseSpeakerBoost = false,
    string ModelId = "eleven_multilingual_v2");

public class GenerateSpeechHandler(IElevenLabsService elevenLabs)
{
    public Task<Stream> HandleAsync(GenerateSpeechCommand cmd, CancellationToken ct = default)
    {
        var request = new TtsRequest
        {
            Text = cmd.Text,
            VoiceId = cmd.VoiceId,
            Stability = cmd.Stability,
            SimilarityBoost = cmd.SimilarityBoost,
            Style = cmd.Style,
            UseSpeakerBoost = cmd.UseSpeakerBoost,
            ModelId = cmd.ModelId
        };
        return elevenLabs.GenerateSpeechAsync(request, ct);
    }
}
