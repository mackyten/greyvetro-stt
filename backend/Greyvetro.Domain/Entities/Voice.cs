namespace Greyvetro.Domain.Entities;

public class Voice
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public bool IsCustom { get; init; }
    public string? PreviewUrl { get; init; }
    public Dictionary<string, string> Labels { get; init; } = [];
}
