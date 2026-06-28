namespace Greyvetro.Domain.Entities;

public class Usage
{
    public int CharacterCount { get; init; }
    public int CharacterLimit { get; init; }
    public string Tier { get; init; } = string.Empty;
    public bool CanCloneVoices { get; init; }
    public DateTime? NextReset { get; init; }

    public int Remaining => Math.Max(0, CharacterLimit - CharacterCount);
}
