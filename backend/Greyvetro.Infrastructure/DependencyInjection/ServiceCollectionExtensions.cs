using ElevenLabs;
using Greyvetro.Application.Features.Render;
using Greyvetro.Application.Features.Script;
using Greyvetro.Application.Features.SpeechToText;
using Greyvetro.Application.Features.TextToSpeech;
using Greyvetro.Application.Features.Usage;
using Greyvetro.Application.Features.Voices;
using Greyvetro.Domain.Interfaces;
using Greyvetro.Infrastructure.ElevenLabs;
using Greyvetro.Infrastructure.Ffmpeg;
using Greyvetro.Infrastructure.Gemini;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Greyvetro.Infrastructure.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, string apiKey, string? geminiApiKey, string geminiModel)
    {
        services.AddSingleton(new ElevenLabsClient(new ElevenLabsAuthentication(apiKey)));
        // Typed client for ElevenLabs REST calls the SDK doesn't cover (Scribe STT).
        services.AddHttpClient<IElevenLabsService, ElevenLabsService>(http =>
        {
            http.BaseAddress = new Uri("https://api.elevenlabs.io/");
            http.DefaultRequestHeaders.Add("xi-api-key", apiKey);
            http.Timeout = TimeSpan.FromMinutes(5);
        });
        services.AddScoped<GenerateSpeechHandler>();
        services.AddScoped<GetVoicesHandler>();
        services.AddScoped<CloneVoiceHandler>();
        services.AddScoped<GetUsageHandler>();
        services.AddScoped<TranscribeAudioHandler>();

        // Gemini (script/scene generation). The key is optional — without it the
        // service throws a clear "not configured" error on first use.
        services.AddHttpClient("gemini", http =>
        {
            http.BaseAddress = new Uri("https://generativelanguage.googleapis.com/");
            if (!string.IsNullOrWhiteSpace(geminiApiKey))
                http.DefaultRequestHeaders.Add("x-goog-api-key", geminiApiKey);
            http.Timeout = TimeSpan.FromMinutes(3);
        });
        services.AddScoped<IScriptGenerationService>(sp => new GeminiService(
            sp.GetRequiredService<IHttpClientFactory>().CreateClient("gemini"),
            geminiModel,
            sp.GetRequiredService<ILogger<GeminiService>>()));
        services.AddScoped<GenerateScriptHandler>();
        services.AddScoped<GenerateScenesHandler>();

        // ffmpeg render (Greyvetro Studio Phase 4 — legacy scene path).
        services.AddScoped<IVideoRenderService, FfmpegVideoRenderer>();
        services.AddScoped<RenderVideoHandler>();

        // Timeline editor render (Greyvetro Studio Phase 5). The compiler is a pure,
        // stateless function — a singleton — driving the ffmpeg-executing renderer.
        services.AddSingleton<FilterGraphCompiler>();
        services.AddScoped<ITimelineRenderer, FfmpegTimelineRenderer>();
        services.AddScoped<RenderTimelineHandler>();
        return services;
    }
}
