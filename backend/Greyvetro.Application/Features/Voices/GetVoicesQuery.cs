using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.Voices;

public record GetVoicesQuery;

public class GetVoicesHandler(IElevenLabsService elevenLabs)
{
    public Task<IReadOnlyList<Voice>> HandleAsync(GetVoicesQuery _, CancellationToken ct = default)
        => elevenLabs.GetVoicesAsync(ct);
}
