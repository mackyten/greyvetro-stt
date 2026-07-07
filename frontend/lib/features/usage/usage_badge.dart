import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'usage_model.dart';

/// How the credit indicator renders.
enum UsageBadgeVariant {
  /// Horizontal pill (icon + "N credits left" + bar) for header rows.
  pill,

  /// Vertical card (big remaining count + bar) for the sidebar footer.
  sidebar,
}

/// Credit-usage indicator. Call [UsageBadgeState.refresh] (via a GlobalKey) to
/// re-fetch after a generation consumes credits.
class UsageBadge extends StatefulWidget {
  final ApiClient apiClient;
  final UsageBadgeVariant variant;
  const UsageBadge({
    super.key,
    required this.apiClient,
    this.variant = UsageBadgeVariant.pill,
  });

  @override
  State<UsageBadge> createState() => UsageBadgeState();
}

class UsageBadgeState extends State<UsageBadge> {
  UsageModel? _usage;
  bool _loading = true;
  bool _failed = false;

  bool get _isSidebar => widget.variant == UsageBadgeVariant.sidebar;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final usage = await widget.apiClient.getUsage();
      if (mounted) setState(() => _usage = usage);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _usage == null) {
      return _isSidebar ? _sidebarShell(_spinnerRow(context)) : _pillLoading();
    }
    if (_failed || _usage == null) {
      return _isSidebar ? _sidebarFailed(context) : _pillFailed(context);
    }
    return _isSidebar ? _sidebarLoaded(context) : _pillLoaded(context);
  }

  // ---- Sidebar card ---------------------------------------------------------

  Widget _sidebarLoaded(BuildContext context) {
    final c = context.brand;
    final u = _usage!;
    final nearLimit = u.usedFraction >= 0.85;
    return Tooltip(
      message: _tooltip(u),
      child: _sidebarShell(
        InkWell(
          onTap: refresh,
          borderRadius: BorderRadius.circular(13),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                textBaseline: TextBaseline.alphabetic,
                crossAxisAlignment: CrossAxisAlignment.baseline,
                children: [
                  Text(
                    _fmt(u.remaining),
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: nearLimit ? c.pinkDeep : c.text,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    'left',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: c.text3,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _bar(context, u.usedFraction),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sidebarFailed(BuildContext context) {
    final c = context.brand;
    return _sidebarShell(
      InkWell(
        onTap: refresh,
        borderRadius: BorderRadius.circular(13),
        child: Row(
          children: [
            Icon(Icons.refresh_rounded, size: 15, color: c.text3),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                'Credits unavailable',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: c.text3,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _spinnerRow(BuildContext context) {
    final c = context.brand;
    return Row(
      children: [
        SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2, color: c.blueDeep),
        ),
        const SizedBox(width: 10),
        Text(
          'Loading credits…',
          style: TextStyle(fontSize: 12, color: c.text3),
        ),
      ],
    );
  }

  Widget _sidebarShell(Widget child) {
    final c = context.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: c.outline),
      ),
      child: child,
    );
  }

  Widget _bar(BuildContext context, double fraction) {
    final c = context.brand;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.pill),
      child: Stack(
        children: [
          Container(height: 6, color: c.outline),
          FractionallySizedBox(
            widthFactor: fraction.clamp(0.0, 1.0),
            child: Container(
              height: 6,
              decoration: BoxDecoration(gradient: c.sliderGradient),
            ),
          ),
        ],
      ),
    );
  }

  // ---- Header pill ----------------------------------------------------------

  Widget _pillLoaded(BuildContext context) {
    final c = context.brand;
    final u = _usage!;
    final nearLimit = u.usedFraction >= 0.85;
    final accent = nearLimit ? c.pinkDeep : c.blueDeep;
    return _pillShell(
      Tooltip(
        message: _tooltip(u),
        child: InkWell(
          onTap: refresh,
          borderRadius: BorderRadius.circular(AppRadii.pill),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.bolt_rounded, size: 16, color: accent),
              const SizedBox(width: 6),
              Text(
                '${_fmt(u.remaining)} credits left',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: nearLimit ? c.pinkDeep : c.text,
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 64,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: u.usedFraction,
                    minHeight: 6,
                    backgroundColor: c.surfaceMuted,
                    valueColor: AlwaysStoppedAnimation(accent),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _pillLoading() => _pillShell(
    const SizedBox(
      width: 14,
      height: 14,
      child: CircularProgressIndicator(strokeWidth: 2),
    ),
  );

  Widget _pillFailed(BuildContext context) {
    final c = context.brand;
    return _pillShell(
      InkWell(
        onTap: refresh,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.refresh_rounded, size: 16, color: c.text2),
            const SizedBox(width: 6),
            Text(
              'Credits unavailable',
              style: TextStyle(fontSize: 12, color: c.text2),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pillShell(Widget child) {
    final c = context.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: c.outline),
      ),
      child: child,
    );
  }

  String _tooltip(UsageModel u) {
    final used =
        '${_fmt(u.characterCount)} / ${_fmt(u.characterLimit)} characters used';
    final plan = u.tier.isNotEmpty ? '\nPlan: ${u.tier}' : '';
    final reset = u.nextReset != null
        ? '\nResets ${u.nextReset!.toLocal().toString().split(' ').first}'
        : '';
    return '$used$plan$reset\nTap to refresh';
  }

  String _fmt(int n) {
    final s = n.toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return buf.toString();
  }
}
