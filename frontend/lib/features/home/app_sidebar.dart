import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../core/theme_controller.dart';

/// A single navigation destination for [AppSidebar].
class SidebarDestination {
  final IconData icon;
  final String label;
  const SidebarDestination({required this.icon, required this.label});
}

/// Persistent left navigation for the desktop shell. Renders a labelled
/// 212px sidebar at comfortable widths and collapses to a 64px icon rail when
/// [compact]. Hosts the app logo, destinations, the credit card, and the
/// light/dark theme toggle.
class AppSidebar extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onSelect;
  final List<SidebarDestination> destinations;

  /// The credit indicator (shown only in the expanded, labelled layout).
  final Widget usageCard;
  final bool compact;

  const AppSidebar({
    super.key,
    required this.selectedIndex,
    required this.onSelect,
    required this.destinations,
    required this.usageCard,
    required this.compact,
  });

  static const _railWidth = 64.0;
  static const _fullWidth = 212.0;

  @override
  Widget build(BuildContext context) {
    final c = context.brand;
    return Container(
      width: compact ? _railWidth : _fullWidth,
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(right: BorderSide(color: c.outline)),
      ),
      padding: compact
          ? const EdgeInsets.symmetric(vertical: 14)
          : const EdgeInsets.fromLTRB(14, 18, 14, 16),
      child: Column(
        crossAxisAlignment: compact
            ? CrossAxisAlignment.center
            : CrossAxisAlignment.stretch,
        children: [
          _logo(context),
          SizedBox(height: compact ? 10 : 18),
          for (var i = 0; i < destinations.length; i++) ...[
            _navItem(context, i),
            SizedBox(height: compact ? 6 : 3),
          ],
          const Spacer(),
          if (!compact) ...[
            usageCard,
            const SizedBox(height: 9),
          ],
          _themeToggle(context),
        ],
      ),
    );
  }

  Widget _logo(BuildContext context) {
    final c = context.brand;
    final tile = Container(
      width: compact ? 36 : 34,
      height: compact ? 36 : 34,
      decoration: BoxDecoration(
        gradient: c.heroGradient,
        borderRadius: BorderRadius.circular(11),
      ),
      alignment: Alignment.center,
      child: Text(
        'G',
        style: TextStyle(
          color: const Color(0xFF1B2B33),
          fontWeight: FontWeight.w800,
          fontSize: compact ? 17 : 16,
        ),
      ),
    );
    if (compact) return Padding(padding: const EdgeInsets.only(bottom: 10), child: tile);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 0),
      child: Row(
        children: [
          tile,
          const SizedBox(width: 11),
          Text(
            'Greyvetro',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: c.text,
              letterSpacing: -0.2,
            ),
          ),
        ],
      ),
    );
  }

  Widget _navItem(BuildContext context, int i) {
    final c = context.brand;
    final selected = i == selectedIndex;
    final dest = destinations[i];

    final iconColor = selected ? c.blueDeep : c.text2;
    final decoration = selected
        ? BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                c.blue.withValues(alpha: 0.22),
                c.pink.withValues(alpha: 0.22),
              ],
            ),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: c.outline),
          )
        : const BoxDecoration();

    final child = compact
        ? Container(
            width: 42,
            height: 42,
            decoration: decoration,
            alignment: Alignment.center,
            child: Icon(dest.icon, size: 19, color: iconColor),
          )
        : Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: decoration,
            child: Row(
              children: [
                Icon(dest.icon, size: 18, color: iconColor),
                const SizedBox(width: 11),
                Text(
                  dest.label,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    color: selected ? c.text : c.text2,
                  ),
                ),
              ],
            ),
          );

    return Semantics(
      button: true,
      selected: selected,
      label: dest.label,
      child: Tooltip(
        message: compact ? dest.label : '',
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => onSelect(i),
            borderRadius: BorderRadius.circular(12),
            child: child,
          ),
        ),
      ),
    );
  }

  Widget _themeToggle(BuildContext context) {
    final c = context.brand;
    final controller = ThemeScope.of(context);
    final isDark = controller.isDark(context);
    final icon = isDark ? Icons.wb_sunny_outlined : Icons.nightlight_round;
    final label = isDark ? 'Light mode' : 'Dark mode';

    void toggle() => controller.toggle(context);

    if (compact) {
      return Tooltip(
        message: label,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: toggle,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: c.outline),
              ),
              alignment: Alignment.center,
              child: Icon(icon, size: 17, color: c.text2),
            ),
          ),
        ),
      );
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: toggle,
        borderRadius: BorderRadius.circular(11),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: c.outline),
          ),
          child: Row(
            children: [
              Icon(icon, size: 14, color: c.text2),
              const SizedBox(width: 9),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: c.text2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
