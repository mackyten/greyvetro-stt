using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.Script;

public record GenerateSceneImageCommand(string Prompt);

public class GenerateSceneImageHandler(IScriptGenerationService scriptService)
{
    public Task<GeneratedImage> HandleAsync(GenerateSceneImageCommand command, CancellationToken ct = default)
        => scriptService.GenerateSceneImageAsync(command.Prompt, ct);
}
