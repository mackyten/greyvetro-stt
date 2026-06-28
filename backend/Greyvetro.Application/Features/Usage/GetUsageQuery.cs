using Greyvetro.Domain.Interfaces;
using UsageEntity = Greyvetro.Domain.Entities.Usage;

namespace Greyvetro.Application.Features.Usage;

public record GetUsageQuery;

public class GetUsageHandler(IElevenLabsService elevenLabs)
{
    public Task<UsageEntity> HandleAsync(GetUsageQuery _, CancellationToken ct = default)
        => elevenLabs.GetUsageAsync(ct);
}
