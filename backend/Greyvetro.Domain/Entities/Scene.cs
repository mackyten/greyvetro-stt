namespace Greyvetro.Domain.Entities;

/// <summary>A storyboard scene proposed from a transcript: a time slice of the voiceover plus an image prompt.</summary>
public class Scene
{
    /// <summary>Start time in seconds from the beginning of the audio.</summary>
    public double Start { get; init; }

    /// <summary>End time in seconds from the beginning of the audio.</summary>
    public double End { get; init; }

    /// <summary>The narration excerpt this scene covers.</summary>
    public string Narration { get; init; } = string.Empty;

    /// <summary>Detailed visual prompt for generating the scene image.</summary>
    public string ImagePrompt { get; init; } = string.Empty;
}
