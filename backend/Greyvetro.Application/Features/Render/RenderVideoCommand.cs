using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.Render;

public record RenderVideoCommand(RenderJob Job);

public class RenderVideoHandler(IVideoRenderService renderer)
{
    public Task<byte[]> HandleAsync(RenderVideoCommand command, CancellationToken ct = default)
        => renderer.RenderAsync(command.Job, ct);
}
