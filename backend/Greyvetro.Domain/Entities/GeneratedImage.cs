namespace Greyvetro.Domain.Entities;

/// <summary>Raw bytes of an AI-generated scene image plus its MIME type.</summary>
public record GeneratedImage(byte[] Data, string ContentType);
