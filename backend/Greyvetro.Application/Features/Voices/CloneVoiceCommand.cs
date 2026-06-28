using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.Voices;

public record CloneVoiceCommand(string Name, string Description, IEnumerable<Stream> Samples);

public class CloneVoiceHandler(IElevenLabsService elevenLabs)
{
    public Task<Voice> HandleAsync(CloneVoiceCommand cmd, CancellationToken ct = default)
        => elevenLabs.CloneVoiceAsync(cmd.Name, cmd.Description, cmd.Samples, ct);
}
