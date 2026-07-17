using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.Script;

public record GenerateScriptCommand(string Topic, string? Instructions, int TargetSeconds);

public class GenerateScriptHandler(IScriptGenerationService scriptService)
{
    public Task<string> HandleAsync(GenerateScriptCommand command, CancellationToken ct = default)
        => scriptService.GenerateScriptAsync(command.Topic, command.Instructions, command.TargetSeconds, ct);
}
