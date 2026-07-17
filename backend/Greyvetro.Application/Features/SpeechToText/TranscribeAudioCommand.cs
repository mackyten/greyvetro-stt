using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;

namespace Greyvetro.Application.Features.SpeechToText;

public record TranscribeAudioCommand(Stream Audio, string FileName);

public class TranscribeAudioHandler(IElevenLabsService elevenLabs)
{
    public Task<Transcript> HandleAsync(TranscribeAudioCommand command, CancellationToken ct = default)
        => elevenLabs.TranscribeAudioAsync(command.Audio, command.FileName, ct);
}
