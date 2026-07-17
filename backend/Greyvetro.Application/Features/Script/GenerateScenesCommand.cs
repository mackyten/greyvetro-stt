using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.Script;

public record GenerateScenesCommand(Transcript Transcript, string? Instructions);

public class GenerateScenesHandler(IScriptGenerationService scriptService)
{
    public Task<IReadOnlyList<Scene>> HandleAsync(GenerateScenesCommand command, CancellationToken ct = default)
        => scriptService.GenerateScenesAsync(command.Transcript, command.Instructions, ct);
}
