using Greyvetro.Domain.Entities;

namespace Greyvetro.Domain.Interfaces;

public interface IVideoRenderService
{
    /// <summary>Assembles scenes + voiceover into an mp4 and returns its bytes.</summary>
    Task<byte[]> RenderAsync(RenderJob job, CancellationToken ct = default);
}
