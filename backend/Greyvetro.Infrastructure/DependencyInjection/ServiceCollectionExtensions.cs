using ElevenLabs;
using Greyvetro.Application.Features.TextToSpeech;
using Greyvetro.Application.Features.Usage;
using Greyvetro.Application.Features.Voices;
using Greyvetro.Domain.Interfaces;
using Greyvetro.Infrastructure.ElevenLabs;
using Microsoft.Extensions.DependencyInjection;

namespace Greyvetro.Infrastructure.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string apiKey)
    {
        services.AddSingleton(new ElevenLabsClient(new ElevenLabsAuthentication(apiKey)));
        services.AddScoped<IElevenLabsService, ElevenLabsService>();
        services.AddScoped<GenerateSpeechHandler>();
        services.AddScoped<GetVoicesHandler>();
        services.AddScoped<CloneVoiceHandler>();
        services.AddScoped<GetUsageHandler>();
        return services;
    }
}
