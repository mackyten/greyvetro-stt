import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'usage_model.dart';

/// Compact credit-usage indicator. Call [UsageBadgeState.refresh] (via a
/// GlobalKey) to re-fetch after a generation consumes credits.
class UsageBadge extends StatefulWidget {
  final ApiClient apiClient;
  const UsageBadge({super.key, required this.apiClient});

  @override
  State<UsageBadge> createState() => UsageBadgeState();
}

class UsageBadgeState extends State<UsageBadge> {
  UsageModel? _usage;
  bool _loading = true;
  bool _failed = false;

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
      return _shell(
        child: const SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (_failed || _usage == null) {
      return _shell(
        child: InkWell(
          onTap: refresh,
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.refresh_rounded, size: 16, color: AppColors.slate),
              SizedBox(width: 6),
              Text('Credits unavailable',
                  style: TextStyle(fontSize: 12, color: AppColors.slate)),
            ],
          ),
        ),
      );
    }

    final u = _usage!;
    final nearLimit = u.usedFraction >= 0.85;
    final barColor = nearLimit ? AppColors.babyPinkDeep : AppColors.babyBlueDeep;

    return _shell(
      child: Tooltip(
        message: _tooltip(u),
        child: InkWell(
          onTap: refresh,
          borderRadius: BorderRadius.circular(AppRadii.pill),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.bolt_rounded, size: 16, color: barColor),
              const SizedBox(width: 6),
              Text(
                '${_fmt(u.remaining)} credits left',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: nearLimit ? AppColors.babyPinkDeep : AppColors.deep,
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
                    backgroundColor: AppColors.surfaceMuted,
                    valueColor: AlwaysStoppedAnimation(barColor),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _shell({required Widget child}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadii.pill),
          border: Border.all(color: AppColors.outline),
        ),
        child: child,
      );

  String _tooltip(UsageModel u) {
    final used = '${_fmt(u.characterCount)} / ${_fmt(u.characterLimit)} characters used';
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
