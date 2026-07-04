namespace Greyvetro.Domain.Entities;

public class TtsRequest
{
    public string Text { get; init; } = string.Empty;
    public string VoiceId { get; init; } = string.Empty;
    public float Stability { get; init; } = 0.5f;
    public float SimilarityBoost { get; init; } = 0.75f;
    public float Style { get; init; } = 0f;
    public bool UseSpeakerBoost { get; init; }
    public string ModelId { get; init; } = "eleven_multilingual_v2";
}
