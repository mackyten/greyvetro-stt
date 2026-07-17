namespace Greyvetro.Domain.Entities;

public class Transcript
{
    public string Text { get; init; } = string.Empty;
    public string LanguageCode { get; init; } = string.Empty;
    public IReadOnlyList<TranscriptWord> Words { get; init; } = [];
}

public class TranscriptWord
{
    public string Text { get; init; } = string.Empty;

    /// <summary>Start time in seconds from the beginning of the audio.</summary>
    public double Start { get; init; }

    /// <summary>End time in seconds from the beginning of the audio.</summary>
    public double End { get; init; }

    /// <summary>"word", "spacing", or "audio_event" (Scribe categories).</summary>
    public string Type { get; init; } = "word";
}
