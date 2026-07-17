using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.Render;

/// <summary>
/// Render a timeline document. Asset bytes are keyed by <see cref="Clip.SourceId"/>; caption
/// bytes are pre-rendered transparent PNGs keyed by caption <see cref="Clip.Id"/>.
/// </summary>
public record RenderTimelineCommand(
    Timeline Timeline,
    IReadOnlyDictionary<string, byte[]> Assets,
    IReadOnlyDictionary<string, byte[]> Captions);

public class RenderTimelineHandler(ITimelineRenderer renderer)
{
    public Task<byte[]> HandleAsync(RenderTimelineCommand command, CancellationToken ct = default)
        => renderer.RenderAsync(command.Timeline, command.Assets, command.Captions, ct);
}
