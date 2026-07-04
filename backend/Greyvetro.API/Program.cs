using Greyvetro.Application.Features.TextToSpeech;
using Greyvetro.Application.Features.Usage;
using Greyvetro.Application.Features.Voices;
using Greyvetro.Infrastructure.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var apiKey = builder.Configuration["ElevenLabs:ApiKey"]
    ?? throw new InvalidOperationException("ElevenLabs:ApiKey is required.");

builder.Services.AddInfrastructure(apiKey);

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
        var audio = await handler.HandleAsync(new GenerateSpeechCommand(req.Text, req.VoiceId, req.Stability, req.SimilarityBoost, req.Style, req.UseSpeakerBoost), ct);
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

record GenerateSpeechRequest(string Text, string VoiceId, float Stability = 0.5f, float SimilarityBoost = 0.75f, float Style = 0f, bool UseSpeakerBoost = false);
