namespace Greyvetro.Infrastructure.Ffmpeg;

/// <summary>
/// The pure output of <see cref="FilterGraphCompiler"/>: an ordered input arg list, the
/// <c>filter_complex</c> graph (written to a script file by the renderer), and the mux/output
/// args that follow it. The renderer supplies concrete asset paths and injects the
/// filter-script path and the output path. Kept free of file I/O so it can be golden-string
/// tested without ffmpeg.
/// </summary>
public record FfmpegPlan
{
    /// <summary>
    /// Input args in order: <c>-y</c>, then each visual input (<c>-loop 1 -t d -i path</c> for
    /// stills, <c>-f lavfi -t d -i color=…</c> for missing sources), then the audio input(s) last.
    /// </summary>
    public IReadOnlyList<string> InputArgs { get; init; } = [];

    /// <summary>The <c>filter_complex</c> graph string.</summary>
    public string FilterComplex { get; init; } = string.Empty;

    /// <summary>
    /// Mux/output args that follow the filter graph, excluding the output path:
    /// <c>-map [vout] -map N:a -c:v … -movflags +faststart</c>.
    /// </summary>
    public IReadOnlyList<string> OutputArgs { get; init; } = [];
}
