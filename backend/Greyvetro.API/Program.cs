using System.Text.Json;
using Greyvetro.Application.Features.Render;
using Greyvetro.Application.Features.Script;
using Greyvetro.Application.Features.SpeechToText;
using Greyvetro.Application.Features.TextToSpeech;
using Greyvetro.Domain.Entities;
using Greyvetro.Application.Features.Usage;
using Greyvetro.Application.Features.Voices;
using Greyvetro.Infrastructure.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var apiKey = builder.Configuration["ELEVENLABS_APIKEY"]
    ?? throw new InvalidOperationException("ELEVENLABS_APIKEY is required.");

// Optional — script/scene generation returns a clear error until it is set.
var geminiApiKey = builder.Configuration["GEMINI_APIKEY"];
// "gemini-flash-latest" is Google's rolling alias for the current flash model —
// pinned versions (e.g. gemini-2.5-flash) get retired for new API keys.
var geminiModel = builder.Configuration["GEMINI_MODEL"] ?? "gemini-flash-latest";

builder.Services.AddInfrastructure(apiKey, geminiApiKey, geminiModel);

var app = builder.Build();

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();

app.MapGet("/voices", async (GetVoicesHandler handler, CancellationToken ct) =>
{
    var voices = await handler.HandleAsync(new GetVoicesQuery(), ct);
    return Results.Ok(voices);
});

app.MapGet("/usage", async (GetUsageHandler handler, CancellationToken ct) =>
{
    try
    {
        var usage = await handler.HandleAsync(new GetUsageQuery(), ct);
        return Results.Ok(usage);
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(ex.Message, statusCode: (int?)ex.StatusCode ?? 500);
    }
});

app.MapPost("/tts", async (GenerateSpeechRequest req, GenerateSpeechHandler handler, CancellationToken ct) =>
{
    try
    {
        var audio = await handler.HandleAsync(new GenerateSpeechCommand(req.Text, req.VoiceId, req.Stability, req.SimilarityBoost, req.Style, req.UseSpeakerBoost, req.ModelId), ct);
        return Results.Stream(audio, "audio/mpeg");
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(ex.Message, statusCode: (int?)ex.StatusCode ?? 500);
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message, statusCode: 500);
    }
});

app.MapPost("/stt", async (HttpRequest http, TranscribeAudioHandler handler, CancellationToken ct) =>
{
    var form = await http.ReadFormAsync(ct);
    var file = form.Files["file"] ?? form.Files.FirstOrDefault();
    if (file is null)
        return Results.BadRequest("An audio file is required.");
    try
    {
        var transcript = await handler.HandleAsync(new TranscribeAudioCommand(file.OpenReadStream(), file.FileName), ct);
        return Results.Ok(transcript);
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(ex.Message, statusCode: (int?)ex.StatusCode ?? 500);
    }
});

app.MapPost("/script", async (GenerateScriptRequest req, GenerateScriptHandler handler, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.Topic))
        return Results.BadRequest("A topic is required.");
    try
    {
        var script = await handler.HandleAsync(new GenerateScriptCommand(req.Topic, req.Instructions, req.TargetSeconds), ct);
        return Results.Ok(new { script });
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(ex.Message, statusCode: 503);
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(ex.Message, statusCode: (int?)ex.StatusCode ?? 500);
    }
});

app.MapPost("/script/scenes", async (GenerateScenesRequest req, GenerateScenesHandler handler, CancellationToken ct) =>
{
    if (req.Transcript is null || string.IsNullOrWhiteSpace(req.Transcript.Text))
        return Results.BadRequest("A transcript is required.");
    try
    {
        var scenes = await handler.HandleAsync(new GenerateScenesCommand(req.Transcript, req.Instructions), ct);
        return Results.Ok(new { scenes });
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(ex.Message, statusCode: 503);
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(ex.Message, statusCode: (int?)ex.StatusCode ?? 500);
    }
});

app.MapPost("/render", async (HttpRequest http, RenderVideoHandler handler, CancellationToken ct) =>
{
    var form = await http.ReadFormAsync(ct);
    var audio = form.Files["audio"];
    if (audio is null)
        return Results.BadRequest("A voiceover audio file is required.");
    var sceneDtos = JsonSerializer.Deserialize<List<RenderSceneDto>>(
        form["scenes"].ToString(), JsonSerializerOptions.Web);
    if (sceneDtos is null || sceneDtos.Count == 0)
        return Results.BadRequest("At least one scene is required.");

    using var audioMs = new MemoryStream();
    await audio.OpenReadStream().CopyToAsync(audioMs, ct);

    var scenes = new List<RenderScene>();
    foreach (var dto in sceneDtos)
    {
        byte[]? image = null;
        if (dto.ImageIndex is { } idx && form.Files[$"image-{idx}"] is { } file)
        {
            using var ms = new MemoryStream();
            await file.OpenReadStream().CopyToAsync(ms, ct);
            image = ms.ToArray();
        }
        scenes.Add(new RenderScene { Start = dto.Start, End = dto.End, Image = image });
    }

    var job = new RenderJob { Audio = audioMs.ToArray(), Scenes = scenes };
    try
    {
        var mp4 = await handler.HandleAsync(new RenderVideoCommand(job), ct);
        return Results.File(mp4, "video/mp4", "video.mp4");
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(ex.Message, statusCode: 503);
    }
});

app.MapPost("/voices/clone", async (HttpRequest http, CloneVoiceHandler handler, CancellationToken ct) =>
{
    var form = await http.ReadFormAsync(ct);
    var name = form["name"].ToString();
    var description = form["description"].ToString();
    var samples = form.Files.Select(f => f.OpenReadStream());
    var voice = await handler.HandleAsync(new CloneVoiceCommand(name, description, samples), ct);
    return Results.Ok(voice);
});

app.Run();

record GenerateSpeechRequest(string Text, string VoiceId, float Stability = 0.5f, float SimilarityBoost = 0.75f, float Style = 0f, bool UseSpeakerBoost = false, string ModelId = "eleven_multilingual_v2");
record GenerateScriptRequest(string Topic, string? Instructions = null, int TargetSeconds = 60);
record GenerateScenesRequest(Transcript Transcript, string? Instructions = null);
record RenderSceneDto(double Start, double End, int? ImageIndex);
