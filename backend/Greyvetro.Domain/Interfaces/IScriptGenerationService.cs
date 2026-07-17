using Greyvetro.Domain.Entities;

namespace Greyvetro.Domain.Interfaces;

public interface IScriptGenerationService
{
    /// <summary>Writes a TTS-ready voiceover script for a topic.</summary>
    Task<string> GenerateScriptAsync(string topic, string? instructions, int targetSeconds, CancellationToken ct = default);

    /// <summary>Proposes storyboard scenes (time ranges + image prompts) from a word-timestamped transcript.</summary>
    Task<IReadOnlyList<Scene>> GenerateScenesAsync(Transcript transcript, string? instructions, CancellationToken ct = default);
}
