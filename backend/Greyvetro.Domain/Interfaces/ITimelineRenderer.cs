using Greyvetro.Domain.Entities;

namespace Greyvetro.Domain.Interfaces;

public interface ITimelineRenderer
{
    /// <summary>
    /// Compiles a <see cref="Timeline"/> into an ffmpeg filter graph and renders it to an mp4.
    /// Asset bytes are supplied out-of-band, keyed by <see cref="MediaAsset.Id"/> (a clip's
    /// <see cref="Clip.SourceId"/>). Returns the encoded mp4 bytes.
    /// </summary>
    Task<byte[]> RenderAsync(
        Timeline timeline,
        IReadOnlyDictionary<string, byte[]> assets,
        CancellationToken ct = default);
}
