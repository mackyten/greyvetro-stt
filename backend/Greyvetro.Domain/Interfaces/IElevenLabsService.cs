using Greyvetro.Domain.Entities;

namespace Greyvetro.Domain.Interfaces;

public interface IElevenLabsService
{
    Task<IReadOnlyList<Voice>> GetVoicesAsync(CancellationToken ct = default);
    Task<Usage> GetUsageAsync(CancellationToken ct = default);
    Task<Stream> GenerateSpeechAsync(TtsRequest request, CancellationToken ct = default);
    Task<Voice> CloneVoiceAsync(string name, string description, IEnumerable<Stream> samples, CancellationToken ct = default);
    Task<Transcript> TranscribeAudioAsync(Stream audio, string fileName, CancellationToken ct = default);
}
