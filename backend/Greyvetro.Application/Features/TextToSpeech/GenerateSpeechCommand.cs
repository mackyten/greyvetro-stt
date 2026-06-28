using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.TextToSpeech;

public record GenerateSpeechCommand(string Text, string VoiceId, float Stability = 0.5f, float SimilarityBoost = 0.75f);

public class GenerateSpeechHandler(IElevenLabsService elevenLabs)
{
    public Task<Stream> HandleAsync(GenerateSpeechCommand cmd, CancellationToken ct = default)
    {
        var request = new TtsRequest
        {
            Text = cmd.Text,
            VoiceId = cmd.VoiceId,
            Stability = cmd.Stability,
            SimilarityBoost = cmd.SimilarityBoost
        };
        return elevenLabs.GenerateSpeechAsync(request, ct);
    }
}
