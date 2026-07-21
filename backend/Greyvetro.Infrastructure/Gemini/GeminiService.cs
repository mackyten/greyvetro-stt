using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Greyvetro.Domain.Entities;
using Greyvetro.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace Greyvetro.Infrastructure.Gemini;

/// <summary>
/// Script/scene generation via the Google Gemini API (free-tier friendly; the
/// default model is set in Program.cs config). REST reference:
/// https://ai.google.dev/api/generate-content
/// </summary>
public class GeminiService(HttpClient http, string model, string imageModel, ILogger<GeminiService> logger) : IScriptGenerationService
{
    public async Task<string> GenerateScriptAsync(string topic, string? instructions, int targetSeconds, CancellationToken ct = default)
    {
        // ~2.5 spoken words per second is a comfortable narration pace.
        var targetWords = Math.Max(30, (int)(targetSeconds * 2.5));
        var system = $"""
            You write voiceover scripts for short videos, to be read aloud by a text-to-speech voice.
            Rules:
            - Output ONLY the spoken script text: no headings, no scene directions, no markdown, no quotes around it.
            - Plain conversational sentences that sound natural when read aloud.
            - Hook the listener in the first sentence.
            - Target about {targetWords} words (~{targetSeconds} seconds of narration).
            """;
        var user = string.IsNullOrWhiteSpace(instructions)
            ? $"Topic: {topic}"
            : $"Topic: {topic}\n\nAdditional instructions: {instructions}";

        var text = await GenerateAsync(system, user, responseSchema: null, ct);
        return text.Trim();
    }

    public async Task<IReadOnlyList<Scene>> GenerateScenesAsync(Transcript transcript, string? instructions, CancellationToken ct = default)
    {
        var system = """
            You are a storyboard designer for short videos. Given a voiceover transcript with
            word-level timestamps, split it into visual scenes.
            Rules:
            - Scenes must be contiguous, in order, and cover the full narration (first scene starts at 0).
            - Aim for a scene every 4-8 seconds of narration; never shorter than 2 seconds.
            - "narration" is the exact transcript excerpt spoken during the scene.
            - "imagePrompt" is a rich, self-contained visual prompt for an AI image generator:
              describe subject, composition, lighting and mood. Keep a consistent visual style
              across all scenes and restate that style in every prompt (prompts are used independently).
            - Use the word timestamps to set precise start/end seconds.
            """;

        var timings = new StringBuilder();
        foreach (var w in transcript.Words.Where(w => w.Type == "word"))
            timings.AppendLine($"{w.Start:0.00} {w.Text}");

        var user = $"""
            Transcript:
            {transcript.Text}

            Word start times (seconds, one word per line):
            {timings}
            {(string.IsNullOrWhiteSpace(instructions) ? string.Empty : $"\nAdditional instructions: {instructions}")}
            """;

        var schema = new
        {
            type = "ARRAY",
            items = new
            {
                type = "OBJECT",
                properties = new Dictionary<string, object>
                {
                    ["start"] = new { type = "NUMBER" },
                    ["end"] = new { type = "NUMBER" },
                    ["narration"] = new { type = "STRING" },
                    ["imagePrompt"] = new { type = "STRING" },
                },
                required = new[] { "start", "end", "narration", "imagePrompt" },
            },
        };

        var json = await GenerateAsync(system, user, schema, ct);
        var scenes = JsonSerializer.Deserialize<List<SceneDto>>(json)
            ?? throw new HttpRequestException("Gemini returned no scenes.");
        logger.LogInformation("Generated {Count} scenes from a {Words}-word transcript",
            scenes.Count, transcript.Words.Count(w => w.Type == "word"));
        return scenes.Select(s => new Scene
        {
            Start = s.Start,
            End = s.End,
            Narration = s.Narration ?? string.Empty,
            ImagePrompt = s.ImagePrompt ?? string.Empty,
        }).ToList();
    }

    public async Task<GeneratedImage> GenerateSceneImageAsync(string prompt, CancellationToken ct = default)
    {
        if (!http.DefaultRequestHeaders.Contains("x-goog-api-key"))
            throw new InvalidOperationException(
                "GEMINI_APIKEY is not configured. Get a free key at https://aistudio.google.com/apikey and set the GEMINI_APIKEY environment variable.");

        // 9:16 matches the app's vertical export frame; the storyboard cover-fits
        // whatever comes back, so a modest resolution keeps this fast and cheap.
        var request = new
        {
            contents = new[] { new { role = "user", parts = new[] { new { text = prompt } } } },
            generationConfig = new
            {
                responseModalities = new[] { "IMAGE" },
                imageConfig = new { aspectRatio = "9:16", imageSize = "1K" },
            },
        };

        using var response = await http.PostAsJsonAsync($"v1beta/models/{imageModel}:generateContent", request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            logger.LogWarning("Gemini image request failed ({Status}): {Body}", response.StatusCode, body);
            throw new HttpRequestException($"Gemini image request failed: {ExtractErrorMessage(body)}", null, response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<GenerateContentResponse>(ct);
        var inline = result?.Candidates?.FirstOrDefault()?.Content?.Parts?
            .Select(p => p.InlineData)
            .FirstOrDefault(d => d is not null);
        if (inline is null || string.IsNullOrEmpty(inline.Data))
            throw new HttpRequestException(
                $"Gemini returned no image (finishReason: {result?.Candidates?.FirstOrDefault()?.FinishReason ?? "unknown"}).");

        return new GeneratedImage(Convert.FromBase64String(inline.Data), inline.MimeType ?? "image/png");
    }

    private async Task<string> GenerateAsync(string system, string user, object? responseSchema, CancellationToken ct)
    {
        if (!http.DefaultRequestHeaders.Contains("x-goog-api-key"))
            throw new InvalidOperationException(
                "GEMINI_APIKEY is not configured. Get a free key at https://aistudio.google.com/apikey and set the GEMINI_APIKEY environment variable.");

        var request = new
        {
            systemInstruction = new { parts = new[] { new { text = system } } },
            contents = new[] { new { role = "user", parts = new[] { new { text = user } } } },
            generationConfig = responseSchema is null
                ? null
                : (object)new { responseMimeType = "application/json", responseSchema },
        };

        using var response = await http.PostAsJsonAsync(
            $"v1beta/models/{model}:generateContent",
            request,
            new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull },
            ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            logger.LogWarning("Gemini request failed ({Status}): {Body}", response.StatusCode, body);
            throw new HttpRequestException($"Gemini request failed: {ExtractErrorMessage(body)}", null, response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<GenerateContentResponse>(ct);
        var text = result?.Candidates?.FirstOrDefault()?.Content?.Parts is { } parts
            ? string.Concat(parts.Select(p => p.Text))
            : null;
        if (string.IsNullOrWhiteSpace(text))
            throw new HttpRequestException(
                $"Gemini returned no text (finishReason: {result?.Candidates?.FirstOrDefault()?.FinishReason ?? "unknown"}).");
        return text;
    }

    // Gemini error bodies are a deeply nested JSON blob (quota violation lists, retry
    // info, help links); `error.message` alone is the one human-readable sentence —
    // surfacing the raw body instead would dump ~2KB of JSON into an API response/toast.
    private static string ExtractErrorMessage(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var error) &&
                error.TryGetProperty("message", out var message) &&
                message.GetString() is { Length: > 0 } text)
                return text;
        }
        catch (JsonException)
        {
            // Not JSON (or an unexpected shape) — fall through to the raw body.
        }
        return body;
    }

    private sealed record SceneDto(
        [property: JsonPropertyName("start")] double Start,
        [property: JsonPropertyName("end")] double End,
        [property: JsonPropertyName("narration")] string? Narration,
        [property: JsonPropertyName("imagePrompt")] string? ImagePrompt);

    private sealed record GenerateContentResponse(
        [property: JsonPropertyName("candidates")] List<Candidate>? Candidates);

    private sealed record Candidate(
        [property: JsonPropertyName("content")] CandidateContent? Content,
        [property: JsonPropertyName("finishReason")] string? FinishReason);

    private sealed record CandidateContent(
        [property: JsonPropertyName("parts")] List<Part>? Parts);

    private sealed record Part(
        [property: JsonPropertyName("text")] string? Text,
        [property: JsonPropertyName("inlineData")] InlineData? InlineData);

    private sealed record InlineData(
        [property: JsonPropertyName("mimeType")] string? MimeType,
        [property: JsonPropertyName("data")] string? Data);
}
