namespace Greyvetro.Domain.Entities;

/// <summary>
/// The non-destructive, multi-track document the timeline editor produces and the
/// ffmpeg compiler renders. Placement (<see cref="Clip.StartTime"/>/<see cref="Clip.Duration"/>)
/// is kept separate from trim (<see cref="Clip.InPoint"/>/<see cref="Clip.OutPoint"/>) so
/// edits never touch source media until export. Transforms are normalized 0–1 so the
/// output resolution can change without re-authoring.
/// See docs/timeline-editor-plan.md §3.
/// </summary>
public record Timeline
{
    public string Id { get; init; } = string.Empty;

    /// <summary>Export target width in pixels (e.g. 1080).</summary>
    public int OutputWidth { get; init; } = 1080;

    /// <summary>Export target height in pixels (e.g. 1920).</summary>
    public int OutputHeight { get; init; } = 1920;

    public int Fps { get; init; } = 30;

    public IReadOnlyList<Track> Tracks { get; init; } = [];

    /// <summary>
    /// Metadata for the source blobs the clips reference (bytes travel out-of-band). Lets the
    /// compiler tell a still (<see cref="MediaType.Image"/> — looped) from real video
    /// (<see cref="MediaType.Video"/> — trimmed). A source absent here is treated as a still.
    /// </summary>
    public IReadOnlyList<MediaAsset> Assets { get; init; } = [];
}

public enum TrackType
{
    Video,
    Photo,
    Audio,
    Caption,
}

public record Track
{
    public string Id { get; init; } = string.Empty;
    public TrackType Type { get; init; }

    /// <summary>Stacking order for visual tracks; lowest is the base layer.</summary>
    public int ZIndex { get; init; }

    public bool Muted { get; init; }

    /// <summary>0–1 gain for audio tracks (null = unity).</summary>
    public double? Volume { get; init; }

    public IReadOnlyList<Clip> Clips { get; init; } = [];
}

public record Clip
{
    public string Id { get; init; } = string.Empty;

    /// <summary>Reference to the <see cref="MediaAsset"/> this clip draws from.</summary>
    public string SourceId { get; init; } = string.Empty;

    // --- Timeline placement ---

    /// <summary>Seconds from the start of the timeline.</summary>
    public double StartTime { get; init; }

    /// <summary>Seconds this clip occupies on the timeline.</summary>
    public double Duration { get; init; }

    // --- Trim (non-destructive, relative to the source; 0 for stills) ---

    public double InPoint { get; init; }
    public double OutPoint { get; init; }

    // --- Audio ---

    /// <summary>0–1 gain for an individual audio clip (null = unity).</summary>
    public double? Volume { get; init; }
    public double? FadeIn { get; init; }
    public double? FadeOut { get; init; }

    /// <summary>Caption clips carry text; it is rasterized to an overlay at export (later phases).</summary>
    public string? Text { get; init; }
}

public enum MediaType
{
    Video,
    Image,
    Audio,
}

/// <summary>
/// Metadata for a source blob. The bytes themselves travel out-of-band (multipart on the
/// wire, IndexedDB in the browser) keyed by <see cref="Id"/> — never inline here.
/// </summary>
public record MediaAsset
{
    public string Id { get; init; } = string.Empty;
    public MediaType Type { get; init; }
    public int? Width { get; init; }
    public int? Height { get; init; }

    /// <summary>Intrinsic length in seconds for video/audio.</summary>
    public double? Duration { get; init; }
}
