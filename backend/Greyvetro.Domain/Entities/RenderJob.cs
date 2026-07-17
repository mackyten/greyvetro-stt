namespace Greyvetro.Domain.Entities;

/// <summary>
/// Everything needed to assemble one video: the voiceover plus ordered scene frames.
/// Frames arrive fully composited (captions are burned in client-side, where brand
/// fonts live and no ffmpeg drawtext/freetype support is needed).
/// </summary>
public class RenderJob
{
    public byte[] Audio { get; init; } = [];
    public IReadOnlyList<RenderScene> Scenes { get; init; } = [];
}

public class RenderScene
{
    /// <summary>Start time in seconds on the voiceover timeline.</summary>
    public double Start { get; init; }

    /// <summary>End time in seconds on the voiceover timeline.</summary>
    public double End { get; init; }

    /// <summary>Composited frame bytes; null renders a placeholder card.</summary>
    public byte[]? Image { get; init; }
}
