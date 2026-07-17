using Greyvetro.Domain.Entities;

namespace Greyvetro.Domain.Interfaces;

public interface ITimelineRenderer
{
    /// <summary>
    /// Compiles a <see cref="Timeline"/> into an ffmpeg filter graph and renders it to an mp4.
    /// Asset bytes are supplied out-of-band, keyed by <see cref="MediaAsset.Id"/> (a clip's
    /// <see cref="Clip.SourceId"/>). Caption bytes are pre-rendered transparent PNGs keyed by
    /// caption <see cref="Clip.Id"/> (see docs/timeline-editor-plan.md §5). Returns the mp4 bytes.
    /// </summary>
    Task<byte[]> RenderAsync(
        Timeline timeline,
        IReadOnlyDictionary<string, byte[]> assets,
        IReadOnlyDictionary<string, byte[]> captions,
        CancellationToken ct = default);
}
